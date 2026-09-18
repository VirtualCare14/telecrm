const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const WalkIn = require('../models/WalkIn');
const User = require('../models/User');
const LeadActivity = require('../models/LeadActivity');

exports.createWalkIn = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { walkInDate, walkInTime, remark, remarks, salesAgent: targetSalesAgent, salesAgentId, status } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    const isOwner = lead.currentOwner?.toString() === req.userId;
    const isAgent = req.userRole === 'AGENT' || req.user?.role?.toUpperCase() === 'AGENT';
    if (!isAdmin && !isOwner && !isAgent) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You do not have permission to record walk-ins for this lead' });
    }

    const assignedSalesAgentId = targetSalesAgent || salesAgentId || req.userId;
    let salesAgentName = req.user?.fullName || req.user?.username || 'Sales Agent';
    if (assignedSalesAgentId.toString() !== req.userId.toString()) {
      const agentUser = await User.findById(assignedSalesAgentId).session(session);
      if (agentUser) {
        salesAgentName = agentUser.fullName || agentUser.username || 'Sales Agent';
      }
    }

    const assignedByName = req.user?.fullName || req.user?.username || 'Calling Agent';
    const walkInDateVal = new Date(walkInDate);
    const finalRemark = (remark || remarks || '').trim();
    const finalStatus = status || 'Planned';

    const createdWalkIns = await WalkIn.create([{
      lead: leadId,
      salesAgent: assignedSalesAgentId,
      assignedBy: req.userId,
      updatedBy: req.userId,
      walkInDate: walkInDateVal,
      walkInTime: walkInTime.trim(),
      status: finalStatus,
      remark: finalRemark,
    }], { session });

    const walkInDoc = createdWalkIns[0];

    // Update latestWalkIn on lead
    lead.latestWalkIn = {
      walkInDate: walkInDateVal,
      walkInTime: walkInTime.trim(),
      remark: finalRemark,
      status: finalStatus,
      salesAgent: assignedSalesAgentId,
      salesAgentName,
      assignedBy: req.userId,
      assignedByName,
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
        remark: finalRemark,
        status: finalStatus,
        salesAgentId: assignedSalesAgentId.toString(),
        salesAgentName,
        assignedByName,
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await WalkIn.findById(walkInDoc._id)
      .populate('salesAgent', 'fullName email username agentRole phone')
      .populate('assignedBy', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    res.status(201).json({ walkIn: populated, latestWalkIn: lead.latestWalkIn });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.updateWalkInStatus = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id: leadId, walkInId } = req.params;
    const { status, remark, remarks, walkInDate, walkInTime } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    const walkIn = await WalkIn.findOne({ _id: walkInId, lead: leadId }).session(session);
    if (!walkIn) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Walk-in record not found' });
    }

    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    const isOwner = lead.currentOwner?.toString() === req.userId;
    const isAssignedSalesAgent = walkIn.salesAgent?.toString() === req.userId;
    if (!isAdmin && !isOwner && !isAssignedSalesAgent) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only update walk-ins assigned to you or your leads' });
    }

    const targetStatus = (status || 'Completed').trim();
    const finalRemark = (remark !== undefined ? remark : remarks !== undefined ? remarks : walkIn.remark).trim();

    if (['Done', 'Completed', 'Not Done'].includes(targetStatus) && !finalRemark) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Walk-in remarks are required when completing or marking not done' });
    }

    const updaterName = req.user?.fullName || req.user?.username || 'Agent';
    walkIn.status = targetStatus;
    walkIn.remark = finalRemark;
    if (walkInDate) walkIn.walkInDate = new Date(walkInDate);
    if (walkInTime) walkIn.walkInTime = walkInTime.trim();
    walkIn.updatedBy = req.userId;
    await walkIn.save({ session });

    // Update latestWalkIn on lead
    lead.latestWalkIn = {
      walkInDate: walkIn.walkInDate,
      walkInTime: walkIn.walkInTime,
      remark: walkIn.remark,
      status: walkIn.status,
      salesAgent: walkIn.salesAgent,
      salesAgentName: lead.latestWalkIn?.salesAgentName || updaterName,
      assignedBy: walkIn.assignedBy || lead.latestWalkIn?.assignedBy,
      assignedByName: lead.latestWalkIn?.assignedByName || updaterName,
      recordedAt: lead.latestWalkIn?.recordedAt || walkIn.createdAt,
    };
    await lead.save({ session });

    // Activity log entry
    await LeadActivity.create([{
      lead: leadId,
      action: 'Walk-in Status Updated',
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        walkInId: walkIn._id.toString(),
        status: walkIn.status,
        remark: walkIn.remark,
        updatedByName: updaterName,
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await WalkIn.findById(walkIn._id)
      .populate('salesAgent', 'fullName email username agentRole phone')
      .populate('assignedBy', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    res.json({ walkIn: populated, latestWalkIn: lead.latestWalkIn });
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
      .populate('salesAgent', 'fullName email username agentRole phone')
      .populate('assignedBy', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    res.json({ walkIns });
  } catch (err) {
    next(err);
  }
};
