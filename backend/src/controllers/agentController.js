const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Session = require('../models/Session');
const Lead = require('../models/Lead');
const Role = require('../models/Role');
const ContactPerson = require('../models/ContactPerson');
const LeadActivity = require('../models/LeadActivity');
const CallLog = require('../models/CallLog');
const Demo = require('../models/Demo');
const WalkIn = require('../models/WalkIn');
const FollowUp = require('../models/FollowUp');
const LeadTransferRequest = require('../models/LeadTransferRequest');
const NotificationRead = require('../models/NotificationRead');

exports.createAgent = async (req, res, next) => {
  try {
    const { fullName, email, username, phone, password, role, agentRole } = req.body;
    if (!fullName || !email || !username || !password) return res.status(400).json({ message: 'Missing required fields' });

    const selectedRole = (role || agentRole || '').trim();
    if (!selectedRole) {
      return res.status(400).json({ message: 'Role is required' });
    }

    const roleDoc = await Role.findOne({
      name: { $regex: new RegExp(`^${selectedRole}$`, 'i') }
    });
    if (!roleDoc) {
      return res.status(400).json({ message: `Role "${selectedRole}" does not exist in the system` });
    }
    if (!roleDoc.active) {
      return res.status(400).json({ message: `Role "${roleDoc.name}" is inactive and cannot be assigned to agents` });
    }

    const normalizedEmail = (email || '').trim().toLowerCase();
    const normalizedUsername = (username || '').trim();
    const normalizedFullName = (fullName || '').trim();
    const normalizedPhone = (phone || '').trim();
    if (!normalizedPhone) {
      return res.status(400).json({ message: 'Phone is required' });
    }
    const digits = normalizedPhone.replace(/\D/g, '');
    if (!/^\+?[0-9\s\-()]{7,20}$/.test(normalizedPhone) || digits.length < 7 || digits.length > 15) {
      return res.status(400).json({ message: 'Please enter a valid phone number' });
    }

    const exists = await User.findOne({ $or: [{ email: normalizedEmail }, { username: normalizedUsername }] });
    if (exists) return res.status(400).json({ message: 'Email or username already exists' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      fullName: normalizedFullName,
      email: normalizedEmail,
      username: normalizedUsername,
      phone: normalizedPhone,
      passwordHash,
      role: 'AGENT',
      agentRole: roleDoc.name
    });
    res.status(201).json({ 
      user: { 
        id: user._id, 
        fullName: user.fullName, 
        email: user.email, 
        role: user.role, 
        agentRole: user.agentRole,
        active: user.active 
      } 
    });
  } catch (err) {
    next(err);
  }
};

exports.getAgents = async (req, res, next) => {
  try {
    const agents = await User.find({ role: { $in: ['AGENT', 'agent'] } }).select('-passwordHash').lean();
    const now = new Date();

    const { startDate, endDate } = req.query;
    const dateMatch = {};
    if (startDate || endDate) {
      dateMatch.createdAt = {};
      if (startDate) dateMatch.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateMatch.createdAt.$lte = end;
      }
    }

    const enrichedAgents = await Promise.all(
      agents.map(async (agent) => {
        const isCalling = (agent.agentRole || '').toLowerCase().includes('calling');
        const agentMatch = isCalling
          ? { $or: [{ currentOwner: agent._id }, { createdBy: agent._id }] }
          : { currentOwner: agent._id };

        const leadFilter = Object.keys(dateMatch).length > 0
          ? { ...agentMatch, ...dateMatch }
          : agentMatch;

        const [assignedLeads, wonLeads, lostLeads, upcomingFollowUps, overdueFollowUps] = await Promise.all([
          Lead.countDocuments(leadFilter),
          Lead.countDocuments({ ...leadFilter, closureStatus: 'WON' }),
          Lead.countDocuments({ ...leadFilter, closureStatus: 'LOST' }),
          Lead.countDocuments({
            ...leadFilter,
            closureStatus: 'OPEN',
            nextFollowUpAt: { $gte: now, $gt: new Date(0) }
          }),
          Lead.countDocuments({
            ...leadFilter,
            closureStatus: 'OPEN',
            nextFollowUpAt: { $lt: now, $gt: new Date(0) }
          })
        ]);

        const closedLeads = wonLeads + lostLeads;
        const conversionRate = closedLeads > 0 ? ((wonLeads / closedLeads) * 100).toFixed(1) + '%' : '0.0%';
        const safePhone = (agent.phone && !agent.phone.includes('@')) ? agent.phone : '';

        return {
          ...agent,
          phone: safePhone,
          agentRole: agent.agentRole || (isCalling ? 'Calling Agent' : 'Sales Agent'),
          assignedLeads,
          wonLeads,
          lostLeads,
          upcomingFollowUps,
          overdueFollowUps,
          conversionRate,
        };
      })
    );

    res.json({ agents: enrichedAgents });
  } catch (err) {
    next(err);
  }
};

exports.getAgent = async (req, res, next) => {
  try {
    const agent = await User.findById(req.params.id).select('-passwordHash');
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    res.json({ agent });
  } catch (err) {
    next(err);
  }
};

exports.updateAgent = async (req, res, next) => {
  try {
    const { fullName, email, username, phone, role, agentRole } = req.body;
    const agent = await User.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    // Check if email is being changed and if it already exists
    if (email && email.trim().toLowerCase() !== agent.email) {
      const normalizedEmail = email.trim().toLowerCase();
      const existingEmail = await User.findOne({ email: normalizedEmail, _id: { $ne: agent._id } });
      if (existingEmail) return res.status(400).json({ message: 'Email already exists' });
      agent.email = normalizedEmail;
    }

    // Check if username is being changed and if it already exists
    if (username && username.trim() !== agent.username) {
      const normalizedUsername = username.trim();
      const existingUsername = await User.findOne({ username: normalizedUsername, _id: { $ne: agent._id } });
      if (existingUsername) return res.status(400).json({ message: 'Username already exists' });
      agent.username = normalizedUsername;
    }

    if (phone !== undefined) {
      const trimmedPhone = (phone || '').trim();
      if (!trimmedPhone) {
        return res.status(400).json({ message: 'Phone is required' });
      }
      const digits = trimmedPhone.replace(/\D/g, '');
      if (!/^\+?[0-9\s\-()]{7,20}$/.test(trimmedPhone) || digits.length < 7 || digits.length > 15) {
        return res.status(400).json({ message: 'Please enter a valid phone number' });
      }
      agent.phone = trimmedPhone;
    }

    const newRole = (role || agentRole || '').trim();
    if (newRole) {
      const roleDoc = await Role.findOne({
        name: { $regex: new RegExp(`^${newRole}$`, 'i') }
      });
      if (!roleDoc) {
        return res.status(400).json({ message: `Role "${newRole}" does not exist in the system` });
      }

      // If the role is being changed to a different role, ensure the new role is active
      const isRoleChanging = !agent.agentRole || agent.agentRole.toLowerCase() !== roleDoc.name.toLowerCase();
      if (isRoleChanging && !roleDoc.active) {
        return res.status(400).json({ message: `Role "${roleDoc.name}" is inactive and cannot be assigned to agents` });
      }
      agent.agentRole = roleDoc.name;
    }

    agent.fullName = fullName !== undefined ? fullName.trim() : agent.fullName;
    await agent.save();
    res.json({ 
      agent: { 
        id: agent._id, 
        fullName: agent.fullName, 
        email: agent.email, 
        username: agent.username, 
        phone: agent.phone, 
        role: agent.role,
        agentRole: agent.agentRole || 'Calling Agent',
        active: agent.active 
      } 
    });
  } catch (err) {
    next(err);
  }
};

exports.changeStatus = async (req, res, next) => {
  try {
    const { status } = req.body; // expected boolean
    const agent = await User.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    agent.active = !!status;
    await agent.save();

    if (!agent.active) {
      // invalidate sessions
      await Session.updateMany({ user: agent._id, valid: true }, { valid: false });
    }

    res.json({ message: 'Status updated', active: agent.active });
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ message: 'Missing newPassword' });
    const agent = await User.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    const salt = await bcrypt.genSalt(10);
    agent.passwordHash = await bcrypt.hash(newPassword, salt);
    await agent.save();
    // invalidate sessions so agent must re-login
    await Session.updateMany({ user: agent._id, valid: true }, { valid: false });
    res.json({ message: 'Password changed' });
  } catch (err) {
    next(err);
  }
};

exports.forceLogout = async (req, res, next) => {
  try {
    const agent = await User.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    await Session.updateMany({ user: agent._id, valid: true }, { valid: false });
    res.json({ message: 'Agent force logged out' });
  } catch (err) {
    next(err);
  }
};

exports.getActiveAgents = async (req, res, next) => {
  try {
    const agents = await User.find({ role: 'AGENT', active: true }).select('-passwordHash');
    res.json({ agents });
  } catch (err) {
    next(err);
  }
};

exports.deleteAgent = async (req, res, next) => {
  try {
    const agent = await User.findById(req.params.id);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    if (agent.role === 'ADMIN' || (agent.agentRole && agent.agentRole.toLowerCase() === 'admin')) {
      return res.status(403).json({ message: 'Cannot delete an administrator account' });
    }

    const agentId = agent._id;

    // Find leads owned or created by this agent
    const agentLeads = await Lead.find({
      $or: [{ currentOwner: agentId }, { createdBy: agentId }]
    }).select('_id');
    const agentLeadIds = agentLeads.map((l) => l._id);

    // Cascade delete associated records
    if (agentLeadIds.length > 0) {
      await ContactPerson.deleteMany({ lead: { $in: agentLeadIds } });
      await Lead.deleteMany({ _id: { $in: agentLeadIds } });
    }

    await LeadActivity.deleteMany({
      $or: [{ lead: { $in: agentLeadIds } }, { performedBy: agentId }]
    });
    await CallLog.deleteMany({
      $or: [{ lead: { $in: agentLeadIds } }, { user: agentId }]
    });
    await Demo.deleteMany({
      $or: [{ lead: { $in: agentLeadIds } }, { salesAgent: agentId }, { updatedBy: agentId }]
    });
    await WalkIn.deleteMany({
      $or: [{ lead: { $in: agentLeadIds } }, { salesAgent: agentId }]
    });
    await LeadTransferRequest.deleteMany({
      $or: [{ fromAgent: agentId }, { toAgent: agentId }, { lead: { $in: agentLeadIds } }]
    });
    await Session.deleteMany({ user: agentId });
    await NotificationRead.deleteMany({ user: agentId });

    // Delete agent user
    await User.findByIdAndDelete(agentId);

    res.json({
      message: `Agent ${agent.fullName} and associated data deleted successfully`,
      deletedId: agentId
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get all activities assigned to a Sales Agent (Demos, Walk-ins, Sales Follow-ups)
 */
exports.getAssignedActivities = async (req, res, next) => {
  try {
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    const targetAgentId = (isAdmin && req.query.agentId) ? req.query.agentId : req.userId;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Fetch Demos assigned to the agent
    const demosPromise = Demo.find({ salesAgent: targetAgentId })
      .populate({
        path: 'lead',
        select: 'organizationName leadNumber primaryContact address closureStatus currentOwner',
        populate: { path: 'primaryContact', select: 'name phone email designation' }
      })
      .populate('assignedBy', 'fullName username agentRole')
      .populate('salesAgent', 'fullName username agentRole')
      .lean();

    // Fetch Walk-ins assigned to the agent
    const walkInsPromise = WalkIn.find({ salesAgent: targetAgentId })
      .populate({
        path: 'lead',
        select: 'organizationName leadNumber primaryContact address closureStatus currentOwner',
        populate: { path: 'primaryContact', select: 'name phone email designation' }
      })
      .populate('assignedBy', 'fullName username agentRole')
      .populate('salesAgent', 'fullName username agentRole')
      .lean();

    // Fetch Follow-ups assigned to the agent
    const followUpsPromise = FollowUp.find({ salesAgent: targetAgentId })
      .populate({
        path: 'lead',
        select: 'organizationName leadNumber primaryContact address closureStatus currentOwner',
        populate: { path: 'primaryContact', select: 'name phone email designation' }
      })
      .populate('assignedBy', 'fullName username agentRole')
      .populate('salesAgent', 'fullName username agentRole')
      .lean();

    // Also fetch leads owned by agent that have an active nextFollowUpAt
    const ownedLeadsWithFollowUpPromise = Lead.find({
      currentOwner: targetAgentId,
      closureStatus: 'OPEN',
      nextFollowUpAt: { $exists: true, $ne: null }
    })
      .populate('primaryContact', 'name phone email designation')
      .populate('createdBy', 'fullName username agentRole')
      .lean();

    const [demos, walkIns, followUps, ownedLeadsWithFollowUp] = await Promise.all([
      demosPromise,
      walkInsPromise,
      followUpsPromise,
      ownedLeadsWithFollowUpPromise
    ]);

    // Query WhatsApp communications for these leads
    const allAssignedLeadIds = [
      ...new Set([
        ...demos.map(d => d.lead?._id?.toString()),
        ...walkIns.map(w => w.lead?._id?.toString()),
        ...followUps.map(f => f.lead?._id?.toString()),
        ...ownedLeadsWithFollowUp.map(l => l._id?.toString()),
      ].filter(Boolean))
    ];

    const whatsAppActivities = allAssignedLeadIds.length > 0 ? await LeadActivity.find({
      lead: { $in: allAssignedLeadIds },
      'metadata.channel': 'WhatsApp'
    }).sort({ createdAt: -1 }).populate('performedBy', 'fullName username agentRole').lean() : [];

    const findWhatsApp = (actId, actType, leadId) => {
      const found = whatsAppActivities.find(w => {
        if (actId && w.metadata?.relatedActivityId === actId.toString()) return true;
        if (w.lead?.toString() === leadId.toString() && w.metadata?.relatedActivityType === actType) return true;
        return false;
      }) || whatsAppActivities.find(w => w.lead?.toString() === leadId.toString());

      if (!found) return null;
      return {
        messageType: found.metadata?.messageType || 'WhatsApp Message',
        messageContent: found.metadata?.messageContent || found.details || '',
        sentAt: found.metadata?.sentAt || found.createdAt,
        sentBy: found.metadata?.sentByName || found.performedBy?.fullName || found.performedBy?.username || 'Calling Agent',
        recipientPhone: found.metadata?.recipientPhone || '',
        recipientName: found.metadata?.recipientName || '',
        status: found.metadata?.status || 'Sent (CRM Record)',
      };
    };

    const parseActivityScheduled = (dateInput, timeInput) => {
      let dateStr = '';
      if (dateInput instanceof Date) {
        dateStr = dateInput.toISOString().substring(0, 10);
      } else if (typeof dateInput === 'string') {
        dateStr = dateInput.substring(0, 10);
      } else {
        dateStr = new Date().toISOString().substring(0, 10);
      }

      let year, month, day;
      const parts = dateStr.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        year = parts[0];
        month = parts[1] - 1;
        day = parts[2];
      } else {
        const d = new Date(dateInput || Date.now());
        year = d.getFullYear();
        month = d.getMonth();
        day = d.getDate();
        dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }

      let hours = 10;
      let minutes = 0;
      let cleanTime = '10:00';
      if (timeInput && typeof timeInput === 'string') {
        const [h, m] = timeInput.split(':').map(Number);
        if (!isNaN(h)) hours = h;
        if (!isNaN(m)) minutes = m;
        cleanTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }

      const scheduledDateTime = new Date(year, month, day, hours, minutes, 0, 0);
      return { scheduledDateStr: dateStr, scheduledTimeStr: cleanTime, scheduledDateTime };
    };

    const normalizedActivities = [];

    // 1. Process Demos (Scheduled Demo Date & Time chosen by Calling Agent)
    for (const d of demos) {
      if (!d.lead) continue;
      const rawDateInput = d.demoDate || d.createdAt;
      const { scheduledDateStr, scheduledTimeStr, scheduledDateTime } = parseActivityScheduled(rawDateInput, d.demoTime || '15:00');

      const isDone = d.status === 'Done';
      const isNotDone = d.status === 'Not Done';
      const isToday = !isDone && !isNotDone && scheduledDateTime >= startOfToday && scheduledDateTime <= endOfToday;
      const isOverdue = !isDone && !isNotDone && scheduledDateTime < now;

      let computedStatus = 'Planned';
      if (isDone) computedStatus = 'Completed';
      else if (isNotDone) computedStatus = 'Not Done';
      else if (isOverdue) computedStatus = 'Overdue';
      else if (isToday) computedStatus = 'Today';

      normalizedActivities.push({
        id: d._id.toString(),
        activityId: d._id.toString(),
        activityType: 'Demo',
        leadId: d.lead._id.toString(),
        leadNumber: d.lead.leadNumber,
        organizationName: d.lead.organizationName,
        contactPerson: d.lead.primaryContact?.name || '—',
        contactPhone: d.lead.primaryContact?.phone || '—',
        closureStatus: d.lead.closureStatus || 'OPEN',
        // Scheduled WHEN activity has to happen
        scheduledDate: scheduledDateStr,
        scheduledTime: scheduledTimeStr,
        scheduledDateTime: scheduledDateTime.toISOString(),
        demoDate: scheduledDateStr,
        demoTime: scheduledTimeStr,
        date: scheduledDateStr,
        time: scheduledTimeStr,
        // Separate Assigned On timestamp (when Calling Agent scheduled/created it)
        assignedOn: d.createdAt,
        createdAt: d.createdAt,
        // Calling Agent attribution
        assignedBy: d.assignedBy ? (d.assignedBy.fullName || d.assignedBy.username) : 'Calling Agent',
        assignedById: d.assignedBy?._id?.toString() || null,
        assignedByRole: d.assignedBy?.agentRole || 'Calling Agent',
        salesAgentName: d.salesAgent?.fullName || d.salesAgent?.username || 'Sales Agent',
        remarks: d.remarks || '',
        rawStatus: d.status || 'Planned',
        computedStatus,
        isToday,
        isOverdue,
        whatsAppCommunication: findWhatsApp(d._id, 'Demo', d.lead._id),
      });
    }

    // 2. Process Walk-ins (Actual Walk-in Date & Time)
    for (const w of walkIns) {
      if (!w.lead) continue;
      const rawDateInput = w.walkInDate || w.createdAt;
      const { scheduledDateStr, scheduledTimeStr, scheduledDateTime } = parseActivityScheduled(rawDateInput, w.walkInTime || '11:00');

      const isDone = w.status === 'Done' || w.status === 'Completed';
      const isNotDone = w.status === 'Not Done';
      const isToday = !isDone && !isNotDone && scheduledDateTime >= startOfToday && scheduledDateTime <= endOfToday;
      const isOverdue = !isDone && !isNotDone && scheduledDateTime < now;

      let computedStatus = 'Planned';
      if (isDone) computedStatus = 'Completed';
      else if (isNotDone) computedStatus = 'Not Done';
      else if (isOverdue) computedStatus = 'Overdue';
      else if (isToday) computedStatus = 'Today';

      normalizedActivities.push({
        id: w._id.toString(),
        activityId: w._id.toString(),
        activityType: 'Walk-in',
        leadId: w.lead._id.toString(),
        leadNumber: w.lead.leadNumber,
        organizationName: w.lead.organizationName,
        contactPerson: w.lead.primaryContact?.name || '—',
        contactPhone: w.lead.primaryContact?.phone || '—',
        closureStatus: w.lead.closureStatus || 'OPEN',
        // Scheduled WHEN activity has to happen
        scheduledDate: scheduledDateStr,
        scheduledTime: scheduledTimeStr,
        scheduledDateTime: scheduledDateTime.toISOString(),
        walkInDate: scheduledDateStr,
        walkInTime: scheduledTimeStr,
        date: scheduledDateStr,
        time: scheduledTimeStr,
        // Separate Assigned On timestamp (when Calling Agent scheduled/created it)
        assignedOn: w.createdAt,
        createdAt: w.createdAt,
        // Calling Agent attribution
        assignedBy: w.assignedBy ? (w.assignedBy.fullName || w.assignedBy.username) : 'Calling Agent',
        assignedById: w.assignedBy?._id?.toString() || null,
        assignedByRole: w.assignedBy?.agentRole || 'Calling Agent',
        salesAgentName: w.salesAgent?.fullName || w.salesAgent?.username || 'Sales Agent',
        remarks: w.remark || '',
        rawStatus: w.status || 'Planned',
        computedStatus,
        isToday,
        isOverdue,
        whatsAppCommunication: findWhatsApp(w._id, 'Walk-in', w.lead._id),
      });
    }

    // 3. Process Sales Follow-ups from FollowUp collection (Actual Follow-up Date & Time)
    const followUpLeadIdsTracked = new Set();
    for (const f of followUps) {
      if (!f.lead) continue;
      followUpLeadIdsTracked.add(f.lead._id.toString());
      const rawDateInput = f.followUpDate || f.createdAt;
      const { scheduledDateStr, scheduledTimeStr, scheduledDateTime } = parseActivityScheduled(rawDateInput, f.followUpTime || '10:00');

      const isDone = f.status === 'Done' || f.status === 'Completed';
      const isNotDone = f.status === 'Not Done';
      const isToday = !isDone && !isNotDone && scheduledDateTime >= startOfToday && scheduledDateTime <= endOfToday;
      const isOverdue = !isDone && !isNotDone && scheduledDateTime < now;

      let computedStatus = 'Planned';
      if (isDone) computedStatus = 'Completed';
      else if (isNotDone) computedStatus = 'Not Done';
      else if (isOverdue) computedStatus = 'Overdue';
      else if (isToday) computedStatus = 'Today';

      normalizedActivities.push({
        id: f._id.toString(),
        activityId: f._id.toString(),
        activityType: 'Sales Follow-up',
        leadId: f.lead._id.toString(),
        leadNumber: f.lead.leadNumber,
        organizationName: f.lead.organizationName,
        contactPerson: f.lead.primaryContact?.name || '—',
        contactPhone: f.lead.primaryContact?.phone || '—',
        closureStatus: f.lead.closureStatus || 'OPEN',
        // Scheduled WHEN activity has to happen
        scheduledDate: scheduledDateStr,
        scheduledTime: scheduledTimeStr,
        scheduledDateTime: scheduledDateTime.toISOString(),
        followUpDate: scheduledDateStr,
        followUpTime: scheduledTimeStr,
        date: scheduledDateStr,
        time: scheduledTimeStr,
        // Separate Assigned On timestamp (when Calling Agent scheduled/created it)
        assignedOn: f.createdAt,
        createdAt: f.createdAt,
        // Calling Agent attribution
        assignedBy: f.assignedBy ? (f.assignedBy.fullName || f.assignedBy.username) : 'Calling Agent',
        assignedById: f.assignedBy?._id?.toString() || null,
        assignedByRole: f.assignedBy?.agentRole || 'Calling Agent',
        salesAgentName: f.salesAgent?.fullName || f.salesAgent?.username || 'Sales Agent',
        remarks: f.remarks || '',
        rawStatus: f.status || 'Planned',
        computedStatus,
        isToday,
        isOverdue,
        whatsAppCommunication: findWhatsApp(f._id, 'Sales Follow-up', f.lead._id) || findWhatsApp(f._id, 'Follow-up', f.lead._id),
      });
    }

    // 4. Process any remaining open follow-ups from owned leads not in FollowUp collection
    for (const ol of ownedLeadsWithFollowUp) {
      if (followUpLeadIdsTracked.has(ol._id.toString())) continue;
      const fDate = new Date(ol.nextFollowUpAt);
      const hours = String(fDate.getHours()).padStart(2, '0');
      const mins = String(fDate.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${mins}`;

      const { scheduledDateStr, scheduledTimeStr, scheduledDateTime } = parseActivityScheduled(ol.nextFollowUpAt, timeStr);

      const isToday = scheduledDateTime >= startOfToday && scheduledDateTime <= endOfToday;
      const isOverdue = scheduledDateTime < now;

      let computedStatus = 'Planned';
      if (isOverdue) computedStatus = 'Overdue';
      else if (isToday) computedStatus = 'Today';

      normalizedActivities.push({
        id: `lead_fu_${ol._id.toString()}`,
        activityId: ol._id.toString(),
        activityType: 'Sales Follow-up',
        leadId: ol._id.toString(),
        leadNumber: ol.leadNumber,
        organizationName: ol.organizationName,
        contactPerson: ol.primaryContact?.name || '—',
        contactPhone: ol.primaryContact?.phone || '—',
        closureStatus: ol.closureStatus || 'OPEN',
        scheduledDate: scheduledDateStr,
        scheduledTime: scheduledTimeStr,
        scheduledDateTime: scheduledDateTime.toISOString(),
        followUpDate: scheduledDateStr,
        followUpTime: scheduledTimeStr,
        date: scheduledDateStr,
        time: scheduledTimeStr,
        assignedOn: ol.updatedAt || ol.createdAt,
        createdAt: ol.createdAt,
        assignedBy: ol.createdBy ? (ol.createdBy.fullName || ol.createdBy.username) : 'Calling Agent',
        assignedById: ol.createdBy?._id?.toString() || null,
        assignedByRole: ol.createdBy?.agentRole || 'Calling Agent',
        salesAgentName: req.user?.fullName || req.user?.username || 'Sales Agent',
        remarks: ol.latestRemark || '',
        rawStatus: 'Planned',
        computedStatus,
        isToday,
        isOverdue,
        whatsAppCommunication: findWhatsApp(null, 'Follow-up', ol._id) || findWhatsApp(null, 'Sales Follow-up', ol._id),
      });
    }

    // Summary calculation across all assigned activities
    const summary = {
      total: normalizedActivities.length,
      today: normalizedActivities.filter(a => a.computedStatus === 'Today').length,
      overdue: normalizedActivities.filter(a => a.computedStatus === 'Overdue').length,
      planned: normalizedActivities.filter(a => a.computedStatus === 'Planned').length,
      completed: normalizedActivities.filter(a => a.computedStatus === 'Completed').length,
      notDone: normalizedActivities.filter(a => a.computedStatus === 'Not Done').length,
      demosCount: normalizedActivities.filter(a => a.activityType === 'Demo').length,
      walkInsCount: normalizedActivities.filter(a => a.activityType === 'Walk-in').length,
      followUpsCount: normalizedActivities.filter(a => a.activityType === 'Sales Follow-up').length,
    };

    // Sort order:
    // 1. Overdue first (most urgent)
    // 2. Today next
    // 3. Upcoming Planned next (ascending scheduled date)
    // 4. Completed / Not Done last (descending date)
    normalizedActivities.sort((a, b) => {
      const priorityOrder = { 'Overdue': 1, 'Today': 2, 'Planned': 3, 'Completed': 4, 'Not Done': 5 };
      const rankA = priorityOrder[a.computedStatus] || 99;
      const rankB = priorityOrder[b.computedStatus] || 99;

      if (rankA !== rankB) {
        return rankA - rankB;
      }
      if (rankA === 1 || rankA === 2 || rankA === 3) {
        return new Date(a.scheduledDateTime).getTime() - new Date(b.scheduledDateTime).getTime();
      }
      return new Date(b.scheduledDateTime).getTime() - new Date(a.scheduledDateTime).getTime();
    });

    // Filtering
    let filteredActivities = [...normalizedActivities];
    const { status, type, search } = req.query;

    if (status && status !== 'all') {
      const sLower = status.toLowerCase();
      if (sLower === 'today') {
        filteredActivities = filteredActivities.filter(a => a.computedStatus === 'Today');
      } else if (sLower === 'overdue') {
        filteredActivities = filteredActivities.filter(a => a.computedStatus === 'Overdue');
      } else if (sLower === 'planned') {
        filteredActivities = filteredActivities.filter(a => a.computedStatus === 'Planned');
      } else if (sLower === 'completed' || sLower === 'done') {
        filteredActivities = filteredActivities.filter(a => a.computedStatus === 'Completed');
      } else if (sLower === 'not_done' || sLower === 'not done') {
        filteredActivities = filteredActivities.filter(a => a.computedStatus === 'Not Done');
      }
    }

    if (type && type !== 'all') {
      const tLower = type.toLowerCase();
      filteredActivities = filteredActivities.filter(a => {
        const aTypeLower = a.activityType.toLowerCase().replace(/\s+/g, '_');
        return aTypeLower.includes(tLower) || a.activityType.toLowerCase() === tLower;
      });
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filteredActivities = filteredActivities.filter(a =>
        (a.organizationName && a.organizationName.toLowerCase().includes(q)) ||
        (a.leadNumber && a.leadNumber.toLowerCase().includes(q)) ||
        (a.contactPerson && a.contactPerson.toLowerCase().includes(q)) ||
        (a.contactPhone && a.contactPhone.toLowerCase().includes(q)) ||
        (a.remarks && a.remarks.toLowerCase().includes(q)) ||
        (a.assignedBy && a.assignedBy.toLowerCase().includes(q))
      );
    }

    res.json({
      activities: filteredActivities,
      summary,
      totalCount: normalizedActivities.length,
      filteredCount: filteredActivities.length,
    });
  } catch (err) {
    next(err);
  }
};

