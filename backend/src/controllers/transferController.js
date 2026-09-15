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
