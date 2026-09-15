const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const WalkIn = require('../models/WalkIn');
const LeadActivity = require('../models/LeadActivity');

exports.createWalkIn = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { walkInDate, walkInTime, remark } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Authorization: Sales Agents can only record walk-ins for their own assigned leads
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && lead.currentOwner?.toString() !== req.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only record walk-ins for leads assigned to you' });
    }

    const walkInDateVal = new Date(walkInDate);
    const createdWalkIns = await WalkIn.create([{
      lead: leadId,
      salesAgent: req.userId,
      walkInDate: walkInDateVal,
      walkInTime: walkInTime.trim(),
      remark: remark.trim(),
    }], { session });

    const walkInDoc = createdWalkIns[0];
    const salesAgentName = req.user?.fullName || req.user?.username || 'Sales Agent';

    // Update latestWalkIn on lead, preserving all call logs, dispositions, remarks, and follow-ups
    lead.latestWalkIn = {
      walkInDate: walkInDateVal,
      walkInTime: walkInTime.trim(),
      remark: remark.trim(),
      salesAgent: req.userId,
      salesAgentName,
      recordedAt: new Date(),
    };
    await lead.save({ session });

    // Activity log entry
    await LeadActivity.create([{
      lead: leadId,
      action: 'Walk-in Recorded',
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        walkInId: walkInDoc._id.toString(),
        walkInDate: walkInDateVal,
        walkInTime: walkInTime.trim(),
        remark: remark.trim(),
        salesAgentName,
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await WalkIn.findById(walkInDoc._id).populate('salesAgent', 'fullName email username agentRole');
    res.status(201).json({ walkIn: populated, latestWalkIn: lead.latestWalkIn });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.listWalkIns = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const walkIns = await WalkIn.find({ lead: leadId })
      .sort({ walkInDate: -1, createdAt: -1 })
      .populate('salesAgent', 'fullName email username agentRole');

    res.json({ walkIns });
  } catch (err) {
    next(err);
  }
};
