const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const User = require('../models/User');
const LeadActivity = require('../models/LeadActivity');

exports.bulkTransfer = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { fromAgentId, toAgentId, leadIds } = req.body;
    if (!fromAgentId || !toAgentId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'fromAgentId and toAgentId are required' });
    }

    const fromAgent = await User.findById(fromAgentId);
    const toAgent = await User.findById(toAgentId);
    if (!fromAgent || fromAgent.role !== 'AGENT') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid source agent' });
    }
    if (!toAgent || toAgent.role !== 'AGENT') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid destination agent' });
    }

    const filter = { currentOwner: fromAgentId };
    if (Array.isArray(leadIds) && leadIds.length > 0) filter._id = { $in: leadIds };

    const leads = await Lead.find(filter).session(session);
    if (!leads.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'No leads found for transfer' });
    }

    const leadIdsTransferred = [];
    for (const l of leads) {
      await Lead.findByIdAndUpdate(l._id, { currentOwner: toAgentId }, { session });
      leadIdsTransferred.push(l._id);
      await LeadActivity.create([{ lead: l._id, action: 'Admin Bulk Transfer', performedBy: req.userId, role: req.userRole, metadata: { fromAgentId, toAgentId } }], { session });
    }

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Bulk transfer completed', count: leadIdsTransferred.length, leadIds: leadIdsTransferred });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};
