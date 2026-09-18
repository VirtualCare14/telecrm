const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const User = require('../models/User');
const LeadTransferRequest = require('../models/LeadTransferRequest');
const LeadActivity = require('../models/LeadActivity');

exports.requestTransfer = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const { toAgentId } = req.body;
    if (!toAgentId) return res.status(400).json({ message: 'toAgentId required' });

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    if (lead.closureStatus && lead.closureStatus !== 'OPEN') {
      return res.status(400).json({ message: 'Cannot request transfer for a closed lead' });
    }

    const toAgent = await User.findById(toAgentId);
    if (!toAgent || toAgent.role !== 'AGENT') {
      return res.status(400).json({ message: 'Invalid destination agent' });
    }

    // If Admin transfers, execute the transfer immediately
    if (req.userRole === 'ADMIN') {
      const oldOwner = lead.currentOwner;
      lead.currentOwner = toAgent._id;
      await lead.save();

      const reqDoc = await LeadTransferRequest.create({
        lead: leadId,
        fromAgent: oldOwner || req.userId,
        toAgent: toAgent._id,
        status: 'Approved',
        respondedAt: new Date(),
      });

      await LeadActivity.create([
        {
          lead: leadId,
          action: 'Transfer Approved',
          performedBy: req.userId,
          role: req.userRole,
          metadata: { requestId: reqDoc._id, from: oldOwner, to: toAgent._id },
        },
        {
          lead: leadId,
          action: 'Ownership Changed',
          performedBy: req.userId,
          role: req.userRole,
          metadata: { newOwner: toAgent._id },
        },
      ]);

      return res.status(200).json({ message: 'Lead transferred successfully', request: reqDoc });
    }

    // Only current owner can request transfer
    if (req.userRole === 'AGENT' && lead.currentOwner && lead.currentOwner.toString() !== req.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Prevent duplicate pending request for same lead to same agent
    const existing = await LeadTransferRequest.findOne({ lead: leadId, toAgent: toAgent._id, status: 'Pending' });
    if (existing) return res.status(400).json({ message: 'Duplicate pending transfer request exists' });

    const reqDoc = await LeadTransferRequest.create({ lead: leadId, fromAgent: req.userId, toAgent: toAgent._id, status: 'Pending' });

    await LeadActivity.create({
      lead: leadId,
      action: 'Transfer Requested',
      performedBy: req.userId,
      role: req.userRole,
      metadata: { toAgent: toAgent._id, requestId: reqDoc._id },
    });

    res.status(201).json({ request: reqDoc });
  } catch (err) {
    next(err);
  }
};

exports.incomingRequests = async (req, res, next) => {
  try {
    const requests = await LeadTransferRequest.find({ toAgent: req.userId }).sort({ requestedAt: -1 }).populate('lead fromAgent toAgent');
    res.json({ requests });
  } catch (err) {
    next(err);
  }
};

exports.outgoingRequests = async (req, res, next) => {
  try {
    const requests = await LeadTransferRequest.find({ fromAgent: req.userId }).sort({ requestedAt: -1 }).populate('lead fromAgent toAgent');
    res.json({ requests });
  } catch (err) {
    next(err);
  }
};

exports.approveRequest = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const reqId = req.params.id;
    const reqDoc = await LeadTransferRequest.findById(reqId).session(session);
    if (!reqDoc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Transfer request not found' });
    }

    if (reqDoc.status !== 'Pending') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Transfer request is not pending' });
    }

    // Only the toAgent can approve
    if (req.userRole === 'AGENT' && reqDoc.toAgent.toString() !== req.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden' });
    }

    // change ownership
    const lead = await Lead.findById(reqDoc.lead).session(session);
    if (lead) {
      lead.currentOwner = reqDoc.toAgent;
      await lead.save({ session });
    }

    reqDoc.status = 'Approved';
    reqDoc.respondedAt = new Date();
    await reqDoc.save({ session });

    await LeadActivity.create([{ lead: reqDoc.lead, action: 'Transfer Approved', performedBy: req.userId, role: req.userRole, metadata: { requestId: reqDoc._id, from: reqDoc.fromAgent, to: reqDoc.toAgent } },
    { lead: reqDoc.lead, action: 'Ownership Changed', performedBy: req.userId, role: req.userRole, metadata: { newOwner: reqDoc.toAgent } }], { session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Transfer approved' });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.rejectRequest = async (req, res, next) => {
  try {
    const reqId = req.params.id;
    const reqDoc = await LeadTransferRequest.findById(reqId);
    if (!reqDoc) return res.status(404).json({ message: 'Transfer request not found' });
    if (reqDoc.status !== 'Pending') return res.status(400).json({ message: 'Transfer request is not pending' });
    if (req.userRole === 'AGENT' && reqDoc.toAgent.toString() !== req.userId) return res.status(403).json({ message: 'Forbidden' });

    reqDoc.status = 'Rejected';
    reqDoc.respondedAt = new Date();
    await reqDoc.save();

    await LeadActivity.create({ lead: reqDoc.lead, action: 'Transfer Rejected', performedBy: req.userId, role: req.userRole, metadata: { requestId: reqDoc._id } });

    res.json({ message: 'Transfer rejected' });
  } catch (err) {
    next(err);
  }
};

exports.cancelRequest = async (req, res, next) => {
  try {
    const reqId = req.params.id;
    const reqDoc = await LeadTransferRequest.findById(reqId);
    if (!reqDoc) return res.status(404).json({ message: 'Transfer request not found' });
    if (reqDoc.status !== 'Pending') return res.status(400).json({ message: 'Transfer request is not pending' });
    if (req.userRole === 'AGENT' && reqDoc.fromAgent.toString() !== req.userId) return res.status(403).json({ message: 'Forbidden' });

    reqDoc.status = 'Cancelled';
    reqDoc.respondedAt = new Date();
    await reqDoc.save();

    await LeadActivity.create({ lead: reqDoc.lead, action: 'Transfer Cancelled', performedBy: req.userId, role: req.userRole, metadata: { requestId: reqDoc._id } });

    res.json({ message: 'Transfer request cancelled' });
  } catch (err) {
    next(err);
  }
};

exports.getTransferHistory = async (req, res, next) => {
  try {
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role === 'ADMIN' || (req.user?.agentRole && req.user.agentRole.toLowerCase() === 'admin');
    const userId = req.userId;
    const { leadId, search, startDate, endDate, status } = req.query;

    // 1. Fetch leads relevant to the user
    let leadFilter = {};
    if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
      leadFilter._id = leadId;
    }

    const leads = await Lead.find(leadFilter)
      .populate('currentOwner', 'fullName username email agentRole role')
      .populate('createdBy', 'fullName username email agentRole role')
      .populate('ownershipHistory.previousOwner', 'fullName username email agentRole role')
      .populate('ownershipHistory.newOwner', 'fullName username email agentRole role')
      .populate('ownershipHistory.transferredBy', 'fullName username email agentRole role')
      .lean();

    const leadMap = {};
    leads.forEach((l) => {
      leadMap[l._id.toString()] = l;
    });

    // 2. Fetch LeadActivity records relating to transfers to extract any remarks/reasons
    const transferActs = await LeadActivity.find({
      action: { $in: ['Lead Transferred', 'Transfer Approved', 'Ownership Changed'] }
    }).lean();

    const activityRemarksByRequestId = {};
    const activityRemarksByLeadAndDate = {};
    transferActs.forEach((act) => {
      const remarks = act.metadata?.remarks || act.metadata?.reason || '';
      if (act.metadata?.requestId) {
        activityRemarksByRequestId[act.metadata.requestId.toString()] = remarks;
      }
      if (act.lead && remarks) {
        const key = `${act.lead.toString()}_${new Date(act.createdAt).toISOString().slice(0, 16)}`;
        activityRemarksByLeadAndDate[key] = remarks;
      }
    });

    const transfers = [];
    const seenTransferSignatures = new Set();

    // Source A: Lead.ownershipHistory
    leads.forEach((lead) => {
      if (Array.isArray(lead.ownershipHistory)) {
        lead.ownershipHistory.forEach((step, idx) => {
          if (!step.isInitial && (step.previousOwner || idx > 0)) {
            const fromId = (step.previousOwner?._id || step.previousOwner)?.toString();
            const toId = (step.newOwner?._id || step.newOwner)?.toString();
            const byId = (step.transferredBy?._id || step.transferredBy)?.toString();
            const creatorId = (lead.createdBy?._id || lead.createdBy)?.toString();

            // Calling Agent visibility check:
            if (!isAdmin && userId) {
              const uId = userId.toString();
              const isParticipant = fromId === uId || toId === uId || byId === uId || creatorId === uId;
              if (!isParticipant) return;
            }

            const transTime = step.transferredAt ? new Date(step.transferredAt) : new Date(lead.updatedAt);
            const sig = `${lead._id.toString()}_${toId}_${transTime.toISOString().slice(0, 16)}`;
            seenTransferSignatures.add(sig);

            const remarks = (step.remarks || step.reason || '').trim() || 'Ownership transferred to new active agent';

            transfers.push({
              id: step._id ? step._id.toString() : `oh_${lead._id}_${idx}`,
              leadId: lead._id.toString(),
              leadNumber: lead.leadNumber,
              organizationName: lead.organizationName,
              previousOwner: step.previousOwner?.fullName || step.previousOwnerName || step.previousOwner?.username || 'Unassigned',
              previousOwnerId: fromId,
              previousOwnerRole: step.previousOwner?.agentRole || step.previousOwner?.role || 'Calling Agent',
              transferredTo: step.newOwner?.fullName || step.newOwnerName || step.newOwner?.username || 'Sales Agent',
              transferredToId: toId,
              transferredToRole: step.newOwner?.agentRole || step.newOwner?.role || 'Sales Agent',
              transferredBy: step.transferredBy?.fullName || step.transferredByName || step.transferredBy?.username || (isAdmin ? 'Admin User' : 'Calling Agent'),
              transferredById: byId,
              transferredByRole: step.transferredBy?.agentRole || step.transferredBy?.role || 'Calling Agent',
              transferredAt: transTime,
              reason: remarks,
              remarks: remarks,
              currentOwner: lead.currentOwner?.fullName || lead.currentOwner?.username || 'Unassigned',
              currentOwnerId: lead.currentOwner?._id?.toString(),
              currentOwnerRole: lead.currentOwner?.agentRole || lead.currentOwner?.role || 'Agent',
              status: 'Completed',
              source: 'ownershipHistory',
            });
          }
        });
      }
    });

    // Source B: LeadTransferRequest
    let reqFilter = {};
    if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
      reqFilter.lead = leadId;
    }

    const requests = await LeadTransferRequest.find(reqFilter)
      .populate('fromAgent', 'fullName username email agentRole role')
      .populate('toAgent', 'fullName username email agentRole role')
      .populate({
        path: 'lead',
        select: 'leadNumber organizationName currentOwner createdBy updatedAt',
        populate: { path: 'currentOwner', select: 'fullName username email agentRole role' }
      })
      .sort({ createdAt: -1 })
      .lean();

    requests.forEach((r) => {
      const lead = r.lead ? leadMap[r.lead._id ? r.lead._id.toString() : r.lead.toString()] || r.lead : null;
      if (!lead) return;

      const fromId = (r.fromAgent?._id || r.fromAgent)?.toString();
      const toId = (r.toAgent?._id || r.toAgent)?.toString();
      const creatorId = (lead.createdBy?._id || lead.createdBy)?.toString();

      if (!isAdmin && userId) {
        const uId = userId.toString();
        const isParticipant = fromId === uId || toId === uId || creatorId === uId;
        if (!isParticipant) return;
      }

      const transTime = new Date(r.respondedAt || r.requestedAt || r.createdAt);
      const sig = `${lead._id.toString()}_${toId}_${transTime.toISOString().slice(0, 16)}`;

      if (!seenTransferSignatures.has(sig)) {
        seenTransferSignatures.add(sig);

        let remarks = activityRemarksByRequestId[r._id.toString()];
        if (!remarks) {
          const key = `${lead._id.toString()}_${transTime.toISOString().slice(0, 16)}`;
          remarks = activityRemarksByLeadAndDate[key];
        }
        if (!remarks) {
          remarks = 'Ownership transferred to new active agent';
        }

        const transStatus = r.status === 'Approved' ? 'Completed' : r.status;

        transfers.push({
          id: r._id.toString(),
          leadId: lead._id.toString(),
          leadNumber: lead.leadNumber,
          organizationName: lead.organizationName,
          previousOwner: r.fromAgent?.fullName || r.fromAgent?.username || 'Previous Owner',
          previousOwnerId: fromId,
          previousOwnerRole: r.fromAgent?.agentRole || r.fromAgent?.role || 'Calling Agent',
          transferredTo: r.toAgent?.fullName || r.toAgent?.username || 'Sales Agent',
          transferredToId: toId,
          transferredToRole: r.toAgent?.agentRole || r.toAgent?.role || 'Sales Agent',
          transferredBy: r.fromAgent?.fullName || r.fromAgent?.username || 'Calling Agent',
          transferredById: fromId,
          transferredByRole: r.fromAgent?.agentRole || r.fromAgent?.role || 'Calling Agent',
          transferredAt: transTime,
          reason: remarks,
          remarks: remarks,
          currentOwner: lead.currentOwner?.fullName || lead.currentOwner?.username || 'Unassigned',
          currentOwnerId: lead.currentOwner?._id?.toString(),
          currentOwnerRole: lead.currentOwner?.agentRole || lead.currentOwner?.role || 'Agent',
          status: transStatus,
          source: 'transferRequest',
        });
      }
    });

    // Chronological sorting: newest first
    transfers.sort((a, b) => new Date(b.transferredAt) - new Date(a.transferredAt));

    // Optional Search filter
    let filtered = transfers;
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((t) =>
        (t.organizationName && t.organizationName.toLowerCase().includes(q)) ||
        (t.leadNumber && t.leadNumber.toLowerCase().includes(q)) ||
        (t.previousOwner && t.previousOwner.toLowerCase().includes(q)) ||
        (t.transferredTo && t.transferredTo.toLowerCase().includes(q)) ||
        (t.transferredBy && t.transferredBy.toLowerCase().includes(q)) ||
        (t.currentOwner && t.currentOwner.toLowerCase().includes(q)) ||
        (t.reason && t.reason.toLowerCase().includes(q))
      );
    }

    if (status && status !== 'all') {
      filtered = filtered.filter((t) => t.status.toLowerCase() === status.toLowerCase());
    }

    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filtered = filtered.filter((t) => new Date(t.transferredAt) >= start);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filtered = filtered.filter((t) => new Date(t.transferredAt) <= end);
      }
    }

    res.json({
      transfers: filtered,
      totalCount: transfers.length,
      filteredCount: filtered.length,
    });
  } catch (err) {
    next(err);
  }
};
