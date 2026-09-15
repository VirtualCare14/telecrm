const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Demo = require('../models/Demo');
const LeadActivity = require('../models/LeadActivity');

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
    const { demoDate, demoTime, remarks = '' } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Authorization: Sales Agents can only operate on their own assigned leads
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && lead.currentOwner?.toString() !== req.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only schedule demos for leads assigned to you' });
    }

    const demoDateVal = new Date(demoDate);
    // Requirement 2: A scheduled Demo should initially have status "Planned"
    const demoStatus = 'Planned';
    const demoRemarks = (remarks || '').trim();
    const agentName = req.user?.fullName || req.user?.username || 'Sales Agent';

    const createdDemos = await Demo.create([{
      lead: leadId,
      salesAgent: req.userId,
      updatedBy: req.userId,
      demoDate: demoDateVal,
      demoTime: demoTime.trim(),
      status: demoStatus,
      remarks: demoRemarks,
    }], { session });

    const demoDoc = createdDemos[0];

    // Update latestDemo on Lead document (preserves calls, walk-ins, remarks, dispositions, follow-ups)
    lead.latestDemo = {
      demoId: demoDoc._id,
      demoDate: demoDateVal,
      demoTime: demoTime.trim(),
      status: demoStatus,
      remarks: demoRemarks,
      salesAgent: req.userId,
      salesAgentName: agentName,
      updatedBy: req.userId,
      updatedByName: agentName,
      scheduledAt: new Date(),
      updatedAt: new Date(),
    };
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
        salesAgentName: agentName,
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await Demo.findById(demoDoc._id)
      .populate('salesAgent', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    res.status(201).json({ demo: populated, latestDemo: lead.latestDemo });
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

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && lead.currentOwner?.toString() !== req.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only update demos for leads assigned to you' });
    }

    const demo = await Demo.findOne({ _id: demoId, lead: leadId }).session(session);
    if (!demo) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Demo record not found' });
    }

    const targetStatus = status.trim();

    // Requirement 4: Require Demo Remarks/Notes when marking a Demo as Done or Not Done
    if (['Done', 'Not Done'].includes(targetStatus)) {
      if (!remarks || !remarks.trim()) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Demo remarks are required when marking a demo as Done or Not Done' });
      }
    }

    // Determine target demo date and time for validation
    const targetDate = demoDate ? demoDate : demo.demoDate;
    const targetTime = demoTime ? demoTime.trim() : demo.demoTime;

    // Requirement 7: Do not allow a future scheduled Demo to be marked Done before its scheduled time
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

    const updaterName = req.user?.fullName || req.user?.username || 'Sales Agent';
    demo.status = targetStatus;
    if (remarks !== undefined) demo.remarks = remarks.trim();
    if (demoDate) demo.demoDate = new Date(demoDate);
    if (demoTime) demo.demoTime = demoTime.trim();
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
      updatedBy: req.userId,
      updatedByName: updaterName,
      scheduledAt: lead.latestDemo?.scheduledAt || demo.createdAt,
      updatedAt: new Date(),
    };
    await lead.save({ session });

    // Activity log entry
    await LeadActivity.create([{
      lead: leadId,
      action: 'Demo Status Updated',
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        demoId: demo._id.toString(),
        status: demo.status,
        remarks: demo.remarks,
        updatedByName: updaterName,
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await Demo.findById(demo._id)
      .populate('salesAgent', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    res.json({ demo: populated, latestDemo: lead.latestDemo });
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
      .populate('salesAgent', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    res.json({ demos });
  } catch (err) {
    next(err);
  }
};
