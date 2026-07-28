const mongoose = require('mongoose');
const Lead = require('../models/Lead');
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

    // Only current owner can request transfer (or Admin could override; enforce here)
    if (req.userRole === 'AGENT' && lead.currentOwner.toString() !== req.userId) return res.status(403).json({ message: 'Forbidden' });

    // Prevent duplicate pending request for same lead to same agent
    const existing = await LeadTransferRequest.findOne({ lead: leadId, toAgent: toAgentId, status: 'Pending' });
    if (existing) return res.status(400).json({ message: 'Duplicate pending transfer request exists' });

    const reqDoc = await LeadTransferRequest.create({ lead: leadId, fromAgent: req.userId, toAgent: toAgentId });

    await LeadActivity.create({ lead: leadId, action: 'Transfer Requested', performedBy: req.userId, role: req.userRole, metadata: { toAgent: toAgentId, requestId: reqDoc._id } });

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
    await Lead.findByIdAndUpdate(reqDoc.lead, { currentOwner: reqDoc.toAgent }, { session });

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
