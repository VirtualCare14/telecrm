const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Demo = require('../models/Demo');
const LeadActivity = require('../models/LeadActivity');

const User = require('../models/User');
const { resolveHospitalMapsLocation, generateDemoWhatsAppMessage } = require('../utils/whatsappHelper');

function getScheduledDateTime(dateInput, timeInput) {
  const d = new Date(dateInput);
  let year = d.getFullYear();
  let month = d.getMonth();
  let date = d.getDate();
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    const parts = dateInput.substring(0, 10).split('-').map(Number);
    year = parts[0];
    month = parts[1] - 1;
    date = parts[2];
  }
  let hours = 0;
  let minutes = 0;
  if (timeInput && typeof timeInput === 'string') {
    const [h, m] = timeInput.split(':').map(Number);
    if (!isNaN(h)) hours = h;
    if (!isNaN(m)) minutes = m;
  }
  return new Date(year, month, date, hours, minutes, 0, 0);
}

exports.createDemo = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { demoDate, demoTime, remarks = '', salesAgent: targetSalesAgent, salesAgentId } = req.body;

    const lead = await Lead.findById(leadId).populate('primaryContact').session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Authorization: Admin, Lead Owner, or Calling/Sales Agent
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    const isOwner = lead.currentOwner?.toString() === req.userId;
    const isAgent = req.userRole === 'AGENT' || req.user?.role?.toUpperCase() === 'AGENT';
    if (!isAdmin && !isOwner && !isAgent) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You do not have permission to schedule demos for this lead' });
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
    const demoDateVal = new Date(demoDate);
    const demoStatus = 'Planned';
    const demoRemarks = (remarks || '').trim();

    // Resolve hospital Google Maps location (verified coords > complete address > unavailable)
    const mapLocation = resolveHospitalMapsLocation(lead);
    const googleMapsUrl = mapLocation.isAvailable ? mapLocation.url : null;

    const createdDemos = await Demo.create([{
      lead: leadId,
      salesAgent: assignedSalesAgentId,
      assignedBy: req.userId,
      updatedBy: req.userId,
      demoDate: demoDateVal,
      demoTime: demoTime.trim(),
      status: demoStatus,
      remarks: demoRemarks,
      googleMapsUrl,
    }], { session });

    const demoDoc = createdDemos[0];

    // Update latestDemo on Lead document
    lead.latestDemo = {
      demoId: demoDoc._id,
      demoDate: demoDateVal,
      demoTime: demoTime.trim(),
      status: demoStatus,
      remarks: demoRemarks,
      salesAgent: assignedSalesAgentId,
      salesAgentName,
      assignedBy: req.userId,
      assignedByName,
      updatedBy: req.userId,
      updatedByName: assignedByName,
      googleMapsUrl,
      scheduledAt: new Date(),
      updatedAt: new Date(),
    };
    lead.updatedBy = req.userId;
    lead.updatedByName = assignedByName;
    await lead.save({ session });

    // Activity log entry
    await LeadActivity.create([{
      lead: leadId,
      action: 'Demo Scheduled',
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        demoId: demoDoc._id.toString(),
        demoDate: demoDateVal,
        demoTime: demoTime.trim(),
        status: demoStatus,
        remarks: demoRemarks,
        salesAgentId: assignedSalesAgentId.toString(),
        salesAgentName,
        assignedByName,
        googleMapsUrl,
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await Demo.findById(demoDoc._id)
      .populate('salesAgent', 'fullName email username agentRole phone')
      .populate('assignedBy', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    const whatsAppMessage = generateDemoWhatsAppMessage({
      hospitalName: lead.organizationName,
      address: lead.address,
      demoDate: demoDateVal,
      demoTime: demoTime.trim(),
      salesAgentName,
      contactPerson: lead.primaryContact?.name,
      contactPhone: lead.primaryContact?.phone,
      remarks: demoRemarks,
      googleMapsUrl,
      lead,
      isRescheduled: false,
    });

    res.status(201).json({ demo: populated, latestDemo: lead.latestDemo, googleMapsUrl, whatsAppMessage });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.updateDemoStatus = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id: leadId, demoId } = req.params;
    const { status, remarks, demoDate, demoTime } = req.body;

    const lead = await Lead.findById(leadId).populate('primaryContact').session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    const demo = await Demo.findOne({ _id: demoId, lead: leadId }).session(session);
    if (!demo) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Demo record not found' });
    }

    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    const isOwner = lead.currentOwner?.toString() === req.userId;
    const isAssignedSalesAgent = demo.salesAgent?.toString() === req.userId;
    if (!isAdmin && !isOwner && !isAssignedSalesAgent) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only update demos assigned to you or your leads' });
    }

    const targetStatus = status.trim();

    // Require Demo Remarks/Notes when marking a Demo as Done or Not Done
    if (['Done', 'Not Done'].includes(targetStatus)) {
      if (!remarks || !remarks.trim()) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Demo remarks are required when marking a demo as Done or Not Done' });
      }
    }

    // Do not allow a future scheduled Demo to be marked Done before its scheduled time
    const targetDate = demoDate ? demoDate : demo.demoDate;
    const targetTime = demoTime ? demoTime.trim() : demo.demoTime;

    if (targetStatus === 'Done') {
      const scheduledDateTime = getScheduledDateTime(targetDate, targetTime);
      const now = new Date();
      if (scheduledDateTime > now) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: 'Cannot mark a scheduled demo as Done before its scheduled date and time',
        });
      }
    }

    const updaterName = req.user?.fullName || req.user?.username || 'Agent';
    const oldStatus = demo.status;
    const oldDate = demo.demoDate;
    const oldTime = demo.demoTime;
    const oldRemarks = demo.remarks;

    // Resolve latest hospital Google Maps location
    const mapLocation = resolveHospitalMapsLocation(lead);
    const googleMapsUrl = mapLocation.isAvailable ? mapLocation.url : null;

    demo.status = targetStatus;
    if (remarks !== undefined) demo.remarks = remarks.trim();
    if (demoDate) demo.demoDate = new Date(demoDate);
    if (demoTime) demo.demoTime = demoTime.trim();
    demo.googleMapsUrl = googleMapsUrl;
    demo.updatedBy = req.userId;
    await demo.save({ session });

    // Update latestDemo on Lead
    lead.latestDemo = {
      demoId: demo._id,
      demoDate: demo.demoDate,
      demoTime: demo.demoTime,
      status: demo.status,
      remarks: demo.remarks,
      salesAgent: demo.salesAgent,
      salesAgentName: lead.latestDemo?.salesAgentName || updaterName,
      assignedBy: demo.assignedBy || lead.latestDemo?.assignedBy,
      assignedByName: lead.latestDemo?.assignedByName || updaterName,
      updatedBy: req.userId,
      updatedByName: updaterName,
      googleMapsUrl,
      scheduledAt: lead.latestDemo?.scheduledAt || demo.createdAt,
      updatedAt: new Date(),
    };
    lead.updatedBy = req.userId;
    lead.updatedByName = updaterName;
    await lead.save({ session });

    const isReschedule = (demoDate && new Date(demoDate).getTime() !== new Date(oldDate).getTime()) || (demoTime && demoTime.trim() !== oldTime);
    const actionName = isReschedule ? 'Demo Rescheduled' : (oldStatus !== targetStatus ? 'Demo Status Updated' : 'Demo Updated');

    // Activity log entry
    await LeadActivity.create([{
      lead: leadId,
      action: actionName,
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        demoId: demo._id.toString(),
        previousStatus: oldStatus,
        newStatus: demo.status,
        previousDate: oldDate,
        newDate: demo.demoDate,
        previousTime: oldTime,
        newTime: demo.demoTime,
        previousRemarks: oldRemarks,
        newRemarks: demo.remarks,
        salesAgentId: demo.salesAgent ? demo.salesAgent.toString() : null,
        salesAgentName: lead.latestDemo?.salesAgentName,
        assignedByName: lead.latestDemo?.assignedByName,
        updatedByName: updaterName,
        googleMapsUrl,
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await Demo.findById(demo._id)
      .populate('salesAgent', 'fullName email username agentRole phone')
      .populate('assignedBy', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    const whatsAppMessage = generateDemoWhatsAppMessage({
      hospitalName: lead.organizationName,
      address: lead.address,
      demoDate: demo.demoDate,
      demoTime: demo.demoTime,
      salesAgentName: lead.latestDemo?.salesAgentName || updaterName,
      contactPerson: lead.primaryContact?.name,
      contactPhone: lead.primaryContact?.phone,
      remarks: demo.remarks,
      googleMapsUrl,
      lead,
      isRescheduled: isReschedule,
    });

    res.json({ demo: populated, latestDemo: lead.latestDemo, googleMapsUrl, whatsAppMessage });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.listDemos = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const demos = await Demo.find({ lead: leadId })
      .sort({ demoDate: -1, createdAt: -1 })
      .populate('salesAgent', 'fullName email username agentRole phone')
      .populate('assignedBy', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    res.json({ demos });
  } catch (err) {
    next(err);
  }
};
