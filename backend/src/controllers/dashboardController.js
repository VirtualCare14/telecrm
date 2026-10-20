const Lead = require('../models/Lead');
const User = require('../models/User');
const CallLog = require('../models/CallLog');
const WalkIn = require('../models/WalkIn');
const Demo = require('../models/Demo');
const LeadActivity = require('../models/LeadActivity');
const FollowUp = require('../models/FollowUp');
const ContactPerson = require('../models/ContactPerson');
const XLSX = require('xlsx');

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function getISTDateString(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function parseDateRange(query) {
  const startDate = query.startDate || query.start;
  const endDate = query.endDate || query.end;
  let start = null;
  let end = null;
  if (startDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      const [sy, sm, sd] = startDate.split('-').map(Number);
      // Start of day in Asia/Kolkata (00:00:00.000 +05:30) converted to UTC instant
      start = new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0, 0) - IST_OFFSET_MS);
    } else {
      start = new Date(startDate);
      if (isNaN(start.getTime())) start = null;
    }
  }
  if (endDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      const [ey, em, ed] = endDate.split('-').map(Number);
      // End of day in Asia/Kolkata (23:59:59.999 +05:30) converted to UTC instant
      end = new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59, 999) - IST_OFFSET_MS);
    } else {
      end = new Date(endDate);
      if (isNaN(end.getTime())) end = null;
    }
  }
  return { start, end };
}

exports.adminDashboard = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req.query);
    const agentFilter = req.query.agentId || req.query.owner || req.query.agent;

    const mongoose = require('mongoose');
    let targetAgentId = null;
    let targetAgent = null;
    let isCalling = false;

    if (agentFilter) {
      if (mongoose.Types.ObjectId.isValid(agentFilter)) {
        targetAgentId = new mongoose.Types.ObjectId(agentFilter);
      } else {
        const found = await User.findOne({
          role: 'AGENT',
          $or: [
            { fullName: new RegExp(`^${agentFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            { username: new RegExp(`^${agentFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            { email: new RegExp(`^${agentFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          ],
        }).select('_id');
        if (found) targetAgentId = found._id;
      }
      if (targetAgentId) {
        targetAgent = await User.findById(targetAgentId).select('agentRole role').lean();
        isCalling = targetAgent?.agentRole?.toLowerCase().includes('calling');
      }
    }

    // Lead filter based on agent ownership / scope
    const agentLeadMatch = {};
    if (targetAgentId) {
      if (isCalling) {
        agentLeadMatch.$or = [{ currentOwner: targetAgentId }, { createdBy: targetAgentId }];
      } else {
        agentLeadMatch.currentOwner = targetAgentId;
      }
    }

    // Activity agent match: Sales Agent assigned or Calling Agent who scheduled/recorded it
    const activityAgentMatch = {};
    if (targetAgentId) {
      activityAgentMatch.$or = [{ salesAgent: targetAgentId }, { assignedBy: targetAgentId }];
    }

    const now = new Date();

    // 1. New Leads (Created in date range)
    const newLeadsMatch = { ...agentLeadMatch };
    if (start || end) {
      newLeadsMatch.createdAt = {};
      if (start) newLeadsMatch.createdAt.$gte = start;
      if (end) newLeadsMatch.createdAt.$lte = end;
    }
    const totalLeadsPromise = Lead.countDocuments(newLeadsMatch);

    // 2. Calls (Called in date range by user)
    const callMatch = {};
    if (targetAgentId) {
      callMatch.$or = [{ user: targetAgentId }, { calledBy: targetAgentId }];
    }
    if (start || end) {
      callMatch.calledAt = {};
      if (start) callMatch.calledAt.$gte = start;
      if (end) callMatch.calledAt.$lte = end;
    }
    const dailyCallsPromise = CallLog.countDocuments(callMatch);

    // 3. Demos Scheduled & Completed (Using actual scheduled demoDate)
    const demoDateMatch = {};
    if (start || end) {
      demoDateMatch.demoDate = {};
      if (start) demoDateMatch.demoDate.$gte = start;
      if (end) demoDateMatch.demoDate.$lte = end;
    }
    const demoFilter = { ...activityAgentMatch, ...demoDateMatch };
    const dailyDemosScheduledPromise = Demo.countDocuments(demoFilter);
    const dailyDemosCompletedPromise = Demo.countDocuments({
      ...demoFilter,
      status: { $in: ['Done', 'Completed'] }
    });

    // 4. Walk-ins Scheduled & Completed (Using actual scheduled walkInDate)
    const walkInDateMatch = {};
    if (start || end) {
      walkInDateMatch.walkInDate = {};
      if (start) walkInDateMatch.walkInDate.$gte = start;
      if (end) walkInDateMatch.walkInDate.$lte = end;
    }
    const walkInFilter = { ...activityAgentMatch, ...walkInDateMatch };
    const dailyWalkinsScheduledPromise = WalkIn.countDocuments(walkInFilter);
    const dailyWalkinsCompletedPromise = WalkIn.countDocuments({
      ...walkInFilter,
      status: { $in: ['Done', 'Completed'] }
    });

    // 5. Sales Follow-ups Scheduled (Using actual followUpDate)
    const FollowUp = require('../models/FollowUp');
    const fuDateMatch = {};
    if (start || end) {
      fuDateMatch.followUpDate = {};
      if (start) fuDateMatch.followUpDate.$gte = start;
      if (end) fuDateMatch.followUpDate.$lte = end;
    }
    const dailySalesFollowupsPromise = FollowUp.countDocuments({ ...activityAgentMatch, ...fuDateMatch });

    // 6. Follow-ups (Scheduled for selected date from FollowUp docs and Lead.nextFollowUpAt)
    const dailyFollowupsPromise = (async () => {
      try {
        const fuDocs = await FollowUp.find({ ...activityAgentMatch, ...fuDateMatch }).select('_id lead').lean();
        const fuLeadIds = fuDocs.map(f => f.lead ? f.lead.toString() : f._id.toString());

        const leadFuMatch = { ...agentLeadMatch, closureStatus: 'OPEN' };
        if (start || end) {
          leadFuMatch.nextFollowUpAt = {};
          if (start) leadFuMatch.nextFollowUpAt.$gte = start;
          if (end) leadFuMatch.nextFollowUpAt.$lte = end;
        } else {
          leadFuMatch.nextFollowUpAt = { $exists: true, $ne: null };
        }
        const leadsWithFu = await Lead.find(leadFuMatch).select('_id').lean();
        const leadFuIds = leadsWithFu.map(l => l._id.toString());

        return new Set([...fuLeadIds, ...leadFuIds]).size;
      } catch (e) {
        return 0;
      }
    })();

    // 7. Overdue Follow-ups (Scheduled in past before now and still OPEN)
    const overdueLimit = (end && end < now) ? end : now;
    let dailyOverdueFollowupsPromise;
    if (start && start >= now) {
      dailyOverdueFollowupsPromise = Promise.resolve(0);
    } else {
      const overdueLeadMatch = {
        ...agentLeadMatch,
        closureStatus: 'OPEN',
        nextFollowUpAt: {
          $lt: overdueLimit,
          $gt: new Date(0),
          ...(start ? { $gte: start } : {})
        }
      };
      dailyOverdueFollowupsPromise = Lead.countDocuments(overdueLeadMatch);
    }

    // 8. Won Leads (Closed won in date range)
    const wonMatch = {
      closureStatus: 'WON',
      ...(targetAgentId ? (isCalling ? { $or: [{ currentOwner: targetAgentId }, { createdBy: targetAgentId }, { closedBy: targetAgentId }] } : { $or: [{ currentOwner: targetAgentId }, { closedBy: targetAgentId }] }) : {})
    };
    if (start || end) {
      const dateRange = { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };
      wonMatch.$or = [
        { closedAt: dateRange },
        { closedAt: null, updatedAt: dateRange },
        { closedAt: { $exists: false }, updatedAt: dateRange }
      ];
    }
    const wonPromise = Lead.countDocuments(wonMatch);

    // 9. Lost Leads (Closed lost in date range)
    const lostMatch = {
      closureStatus: 'LOST',
      ...(targetAgentId ? (isCalling ? { $or: [{ currentOwner: targetAgentId }, { createdBy: targetAgentId }, { closedBy: targetAgentId }] } : { $or: [{ currentOwner: targetAgentId }, { closedBy: targetAgentId }] }) : {})
    };
    if (start || end) {
      const dateRange = { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };
      lostMatch.$or = [
        { closedAt: dateRange },
        { closedAt: null, updatedAt: dateRange },
        { closedAt: { $exists: false }, updatedAt: dateRange }
      ];
    }
    const lostPromise = Lead.countDocuments(lostMatch);

    // 10. Upcoming Follow-ups (Top KPI: scheduled >= now for open leads)
    const upcomingMatch = {
      ...agentLeadMatch,
      closureStatus: 'OPEN',
      nextFollowUpAt: { $gte: now, ...(end ? { $lte: end } : {}) }
    };
    const upcomingPromise = Lead.countDocuments(upcomingMatch);

    // Total Agents & Assigned / Unassigned
    const totalAgentsPromise = targetAgentId
      ? Promise.resolve(1)
      : User.countDocuments({ role: 'AGENT' });

    const activeAgents = await User.find({ role: 'AGENT', active: true }).select('_id');
    const activeAgentIds = activeAgents.map((a) => a._id);

    let assignedToActiveMatch;
    if (targetAgentId) {
      const isAgentActive = activeAgentIds.some((id) => id.toString() === targetAgentId.toString());
      assignedToActiveMatch = isAgentActive ? { ...newLeadsMatch } : null;
    } else {
      assignedToActiveMatch = { ...newLeadsMatch, currentOwner: { $in: activeAgentIds } };
    }
    const assignedToActivePromise = assignedToActiveMatch
      ? Lead.countDocuments(assignedToActiveMatch)
      : Promise.resolve(0);

    const [
      totalLeads,
      dailyCalls,
      dailyDemosScheduled,
      dailyDemosCompleted,
      dailyWalkinsScheduled,
      dailyWalkinsCompleted,
      dailySalesFollowups,
      dailyFollowups,
      dailyOverdueFollowups,
      totalWon,
      totalLost,
      upcomingFollowups,
      totalAgents,
      assignedToActiveLeads,
    ] = await Promise.all([
      totalLeadsPromise,
      dailyCallsPromise,
      dailyDemosScheduledPromise,
      dailyDemosCompletedPromise,
      dailyWalkinsScheduledPromise,
      dailyWalkinsCompletedPromise,
      dailySalesFollowupsPromise,
      dailyFollowupsPromise,
      dailyOverdueFollowupsPromise,
      wonPromise,
      lostPromise,
      upcomingPromise,
      totalAgentsPromise,
      assignedToActivePromise,
    ]);

    const unassignedLeads = Math.max(0, totalLeads - assignedToActiveLeads);

    res.json({
      totalLeads,
      unassignedLeads,
      upcomingFollowups,
      overdueFollowups: dailyOverdueFollowups,
      totalAgents,
      totalWon,
      totalLost,
      dailyActivity: {
        calls: dailyCalls || 0,
        followups: dailyFollowups || 0,
        demos: dailyDemosScheduled || 0,
        demosScheduled: dailyDemosScheduled || 0,
        walkins: dailyWalkinsScheduled || 0,
        walkinsScheduled: dailyWalkinsScheduled || 0,
        salesFollowups: dailySalesFollowups || 0,
        demosCompleted: dailyDemosCompleted || 0,
        walkinsCompleted: dailyWalkinsCompleted || 0,
        overdueFollowups: dailyOverdueFollowups || 0,
        won: totalWon || 0,
        lost: totalLost || 0,
        newLeads: totalLeads || 0,
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.agentDashboard = async (req, res, next) => {
  try {
    const owner = req.userId;
    const mongoose = require('mongoose');
    const ownerObjId = new mongoose.Types.ObjectId(owner);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const isCallingAgent = (req.agentRole && req.agentRole.toLowerCase().includes('calling')) ||
      (req.user?.agentRole && req.user.agentRole.toLowerCase().includes('calling'));
    const matchOwner = isCallingAgent
      ? { $or: [{ currentOwner: ownerObjId }, { createdBy: ownerObjId }] }
      : { currentOwner: ownerObjId };

    // 1. My Total Leads
    const totalLeadsPromise = Lead.countDocuments(matchOwner);

    // 2. Today's Follow-ups (scheduled for today and still OPEN)
    const todayFollowupsPromise = Lead.countDocuments({
      ...matchOwner,
      closureStatus: 'OPEN',
      nextFollowUpAt: { $gte: startOfToday, $lte: endOfToday }
    });

    // 3. Overdue Follow-ups (scheduled in the past before now and still OPEN)
    const overdueFollowupsPromise = Lead.countDocuments({
      ...matchOwner,
      closureStatus: 'OPEN',
      nextFollowUpAt: { $lt: now, $gt: new Date(0) }
    });

    // 4. Upcoming Follow-ups (scheduled at or after now and still OPEN)
    const upcomingFollowupsPromise = Lead.countDocuments({
      ...matchOwner,
      closureStatus: 'OPEN',
      nextFollowUpAt: { $gte: now }
    });

    // Get lead IDs owned/created by agent for cross-referencing Demos and Walk-ins
    const agentLeads = await Lead.find(matchOwner).select('_id').lean();
    const agentLeadIds = agentLeads.map(l => l._id);

    // 5. Today's Scheduled Demos
    const todayDemosPromise = Demo.countDocuments({
      $or: [
        { salesAgent: ownerObjId },
        { assignedBy: ownerObjId },
        { lead: { $in: agentLeadIds } }
      ],
      demoDate: { $gte: startOfToday, $lte: endOfToday }
    });

    // 6. Today's Walk-ins
    const todayWalkInsPromise = WalkIn.countDocuments({
      $or: [
        { salesAgent: ownerObjId },
        { assignedBy: ownerObjId },
        { lead: { $in: agentLeadIds } }
      ],
      $or: [
        { walkInDate: { $gte: startOfToday, $lte: endOfToday } },
        { createdAt: { $gte: startOfToday, $lte: endOfToday } }
      ]
    });

    // 7. Won Leads
    const wonLeadsPromise = Lead.countDocuments({ ...matchOwner, closureStatus: 'WON' });

    // 8. Lost Leads
    const lostLeadsPromise = Lead.countDocuments({ ...matchOwner, closureStatus: 'LOST' });

    // 9. Actionable leads:
    // Overdue Leads
    const overdueLeadsPromise = Lead.find({
      ...matchOwner,
      closureStatus: 'OPEN',
      nextFollowUpAt: { $lt: now, $gt: new Date(0) }
    })
      .sort({ nextFollowUpAt: 1 })
      .limit(30)
      .populate('primaryContact')
      .lean();

    // Today's Follow-up Leads (scheduled for today)
    const todayFollowupLeadsPromise = Lead.find({
      ...matchOwner,
      closureStatus: 'OPEN',
      nextFollowUpAt: { $gte: startOfToday, $lte: endOfToday }
    })
      .sort({ nextFollowUpAt: 1 })
      .limit(30)
      .populate('primaryContact')
      .lean();

    // Today's Demo Leads
    const todayDemoLeadsPromise = Demo.find({
      $or: [
        { salesAgent: ownerObjId },
        { assignedBy: ownerObjId },
        { lead: { $in: agentLeadIds } }
      ],
      demoDate: { $gte: startOfToday, $lte: endOfToday }
    })
      .sort({ demoTime: 1 })
      .limit(30)
      .populate({
        path: 'lead',
        populate: { path: 'primaryContact' }
      })
      .lean();

    // Today's Walk-in Leads
    const todayWalkInLeadsPromise = WalkIn.find({
      $or: [
        { salesAgent: ownerObjId },
        { assignedBy: ownerObjId },
        { lead: { $in: agentLeadIds } }
      ],
      $or: [
        { walkInDate: { $gte: startOfToday, $lte: endOfToday } },
        { createdAt: { $gte: startOfToday, $lte: endOfToday } }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate({
        path: 'lead',
        populate: { path: 'primaryContact' }
      })
      .lean();

    // Other required actions (e.g. Interested leads or new leads needing follow-up scheduled)
    const otherActionLeadsPromise = Lead.find({
      ...matchOwner,
      closureStatus: 'OPEN',
      $or: [
        { latestDisposition: { $in: ['Interested', 'Demo Requested', 'Appointment Booked', 'Proposal Discussion', 'Negotiation'] }, nextFollowUpAt: { $exists: false } },
        { latestDisposition: { $in: ['Interested', 'Demo Requested', 'Appointment Booked', 'Proposal Discussion', 'Negotiation'] }, nextFollowUpAt: null },
        { lastCalledAt: null, nextFollowUpAt: null }
      ]
    })
      .sort({ updatedAt: -1 })
      .limit(30)
      .populate('primaryContact')
      .lean();

    // 10. Recent Activities performed by this agent
    const recentActivitiesPromise = LeadActivity.find({ performedBy: ownerObjId })
      .sort({ createdAt: -1 })
      .limit(25)
      .populate({
        path: 'lead',
        select: 'leadNumber organizationName closureStatus primaryContact currentOwner',
        populate: { path: 'primaryContact', select: 'name phone email designation' }
      })
      .populate('performedBy', 'fullName username email agentRole')
      .lean();

    const [
      totalLeads,
      todayFollowups,
      overdueFollowups,
      upcomingFollowups,
      todayDemos,
      todayWalkIns,
      wonLeads,
      lostLeads,
      overdueLeads,
      todayFollowupLeads,
      todayDemoLeads,
      todayWalkInLeads,
      otherActionLeads,
      recentActivities
    ] = await Promise.all([
      totalLeadsPromise,
      todayFollowupsPromise,
      overdueFollowupsPromise,
      upcomingFollowupsPromise,
      todayDemosPromise,
      todayWalkInsPromise,
      wonLeadsPromise,
      lostLeadsPromise,
      overdueLeadsPromise,
      todayFollowupLeadsPromise,
      todayDemoLeadsPromise,
      todayWalkInLeadsPromise,
      otherActionLeadsPromise,
      recentActivitiesPromise
    ]);

    res.json({
      summary: {
        totalLeads,
        todayFollowups,
        overdueFollowups,
        upcomingFollowups,
        todayDemos,
        todayWalkIns,
        wonLeads,
        lostLeads
      },
      todayActions: {
        overdue: overdueLeads || [],
        todayFollowups: todayFollowupLeads || [],
        todayDemos: todayDemoLeads || [],
        todayWalkIns: todayWalkInLeads || [],
        otherActions: otherActionLeads || []
      },
      recentActivities: recentActivities || [],
      // Backward compatibility fields
      totalLeads,
      upcomingFollowups,
      overdueFollowups,
      totalWon: wonLeads,
      totalLost: lostLeads
    });
  } catch (err) {
    next(err);
  }
};

exports.reports = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req.query);

    // Validation: Start date cannot be after end date
    if (start && end && start > end) {
      return res.status(400).json({ message: 'Start date cannot be after end date' });
    }

    // Determine requested date strings in Asia/Kolkata (IST)
    const startStr = req.query.startDate || (start ? getISTDateString(start) : null);
    const endStr = req.query.endDate || (end ? getISTDateString(end) : null);

    // Handle 366-day cap anchored to end date
    let effectiveStart = start;
    let effectiveStartStr = startStr;
    let isCapped = false;
    let totalSpanDays = 0;

    if (startStr && endStr) {
      const [sy, sm, sd] = startStr.slice(0, 10).split('-').map(Number);
      const [ey, em, ed] = endStr.slice(0, 10).split('-').map(Number);
      const reqStartUtc = new Date(Date.UTC(sy, sm - 1, sd));
      const reqEndUtc = new Date(Date.UTC(ey, em - 1, ed));
      totalSpanDays = Math.round((reqEndUtc.getTime() - reqStartUtc.getTime()) / 86400000) + 1;

      if (totalSpanDays > 366) {
        isCapped = true;
        const cappedDateUtc = new Date(Date.UTC(ey, em - 1, ed - 365));
        const csy = cappedDateUtc.getUTCFullYear();
        const csm = String(cappedDateUtc.getUTCMonth() + 1).padStart(2, '0');
        const csd = String(cappedDateUtc.getUTCDate()).padStart(2, '0');
        effectiveStartStr = `${csy}-${csm}-${csd}`;
        effectiveStart = new Date(Date.UTC(csy, cappedDateUtc.getUTCMonth(), cappedDateUtc.getUTCDate(), 0, 0, 0, 0) - IST_OFFSET_MS);
      }
    }

    const agentFilter = req.query.agentId || req.query.owner || req.query.agent;

    const mongoose = require('mongoose');
    const match = {};
    let targetAgentId = null;
    if (agentFilter) {
      if (mongoose.Types.ObjectId.isValid(agentFilter)) {
        targetAgentId = new mongoose.Types.ObjectId(agentFilter);
      } else {
        const found = await User.findOne({
          role: 'AGENT',
          $or: [
            { fullName: new RegExp(`^${agentFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            { username: new RegExp(`^${agentFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            { email: new RegExp(`^${agentFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          ],
        }).select('_id');
        if (found) targetAgentId = found._id;
      }
      if (targetAgentId) {
        const targetAgent = await User.findById(targetAgentId).select('agentRole').lean();
        const isCalling = targetAgent?.agentRole?.toLowerCase().includes('calling');
        if (isCalling) {
          match.$or = [{ currentOwner: targetAgentId }, { createdBy: targetAgentId }];
        } else {
          match.currentOwner = targetAgentId;
        }
      }
    }
    if (effectiveStart || end) {
      match.createdAt = {};
      if (effectiveStart) match.createdAt.$gte = effectiveStart;
      if (end) match.createdAt.$lte = end;
    }

    const now = new Date();

    const wonLeadMatch = Object.assign({}, match, { closureStatus: 'WON' });
    const lostLeadMatch = Object.assign({}, match, { closureStatus: 'LOST' });

    // 1. Pipeline Status Counts (Exact same logic as Admin Dashboard)
    const totalLeadsPromise = Lead.countDocuments(match);
    const openLeadsPromise = Lead.countDocuments(Object.assign({}, match, { closureStatus: 'OPEN' }));
    const wonLeadsPromise = Lead.countDocuments(wonLeadMatch);
    const lostLeadsPromise = Lead.countDocuments(lostLeadMatch);

    // 2. Follow-up Metrics (Only OPEN leads, exact same logic as Admin Dashboard)
    const upcomingFollowupsPromise = Lead.countDocuments(Object.assign({}, match, {
      closureStatus: 'OPEN',
      nextFollowUpAt: { $gte: now, ...(end ? { $lte: end } : {}) }
    }));
    const overdueMatch = Object.assign({}, match, {
      closureStatus: 'OPEN',
      nextFollowUpAt: { $lt: now, $gt: new Date(0) }
    });
    const overdueFollowupsPromise = Lead.countDocuments(overdueMatch);

    // 3. Deal Value for WON leads
    const wonDealsAggPromise = Lead.aggregate([
      { $match: wonLeadMatch },
      {
        $group: {
          _id: null,
          totalDealValue: { $sum: '$dealValue' },
          count: { $sum: 1 },
          avgDealValue: { $avg: '$dealValue' }
        }
      }
    ]);

    // 4. Breakdown by Lead Source
    const sourcesAggPromise = Lead.aggregate([
      { $match: match },
      { $group: { _id: '$leadSource', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // 5. Breakdown by Disposition
    const dispositionsAggPromise = Lead.aggregate([
      { $match: { ...match, latestDisposition: { $exists: true, $ne: '' } } },
      { $group: { _id: '$latestDisposition', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // 6. Breakdown by Lost Reason
    const lostReasonsAggPromise = Lead.aggregate([
      { $match: { ...lostLeadMatch, lostReason: { $exists: true, $ne: '' } } },
      { $group: { _id: '$lostReason', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // 7. Activity Counts (Calls, Walk-ins, Demos, Follow-ups)
    // Execution-owner attribution: salesAgent is the execution owner, fallback to assignedBy only if salesAgent missing/null
    const activityMatch = {};
    if (targetAgentId) {
      activityMatch.$or = [
        { salesAgent: targetAgentId },
        { salesAgent: null, assignedBy: targetAgentId },
        { salesAgent: { $exists: false }, assignedBy: targetAgentId }
      ];
    }
    if (effectiveStart || end) {
      activityMatch.createdAt = {};
      if (effectiveStart) activityMatch.createdAt.$gte = effectiveStart;
      if (end) activityMatch.createdAt.$lte = end;
    }
    const callMatch = {};
    if (targetAgentId) callMatch.user = targetAgentId;
    if (effectiveStart || end) {
      const dateCond = {};
      if (effectiveStart) dateCond.$gte = effectiveStart;
      if (end) dateCond.$lte = end;
      callMatch.$or = [
        { calledAt: dateCond },
        { calledAt: null, createdAt: dateCond },
        { calledAt: { $exists: false }, createdAt: dateCond }
      ];
    }

    const callsCountPromise = CallLog.countDocuments(callMatch);
    const walkInsCountPromise = WalkIn.countDocuments(activityMatch);
    const demosCountPromise = Demo.countDocuments(activityMatch);
    const completedDemosPromise = Demo.countDocuments({ ...activityMatch, status: 'Done' });
    const demosNotDonePromise = Demo.countDocuments({ ...activityMatch, status: 'Not Done' });

    // Follow-ups Scheduled: Call logs in period where followUpAt was scheduled
    const followUpsScheduledPromise = CallLog.countDocuments({
      ...callMatch,
      followUpAt: { $exists: true, $ne: null }
    });

    // Follow-ups Completed: Calls or direct completions in period on leads that had a scheduled follow-up
    const followUpsCompletedPromise = (async () => {
      try {
        const callsInPeriod = await CallLog.find(callMatch).select('lead calledAt').lean();
        const leadIds = callsInPeriod.map(c => c.lead);
        const priorFollowUps = leadIds.length ? await CallLog.find({
          lead: { $in: leadIds },
          followUpAt: { $exists: true, $ne: null }
        }).select('lead calledAt followUpAt').lean() : [];

        const leadFollowUpMap = {};
        for (const pf of priorFollowUps) {
          const lid = pf.lead.toString();
          if (!leadFollowUpMap[lid]) leadFollowUpMap[lid] = [];
          leadFollowUpMap[lid].push(pf);
        }

        let completed = 0;
        for (const call of callsInPeriod) {
          const lid = call.lead.toString();
          const scheds = leadFollowUpMap[lid];
          if (scheds && scheds.some(s => s.calledAt < call.calledAt)) {
            completed++;
          }
        }

        // Direct completions via Complete Follow-up button
        const compActMatch = { action: 'Follow-up Completed' };
        if (targetAgentId) compActMatch.performedBy = targetAgentId;
        if (start || end) {
          compActMatch.createdAt = {};
          if (start) compActMatch.createdAt.$gte = start;
          if (end) compActMatch.createdAt.$lte = end;
        }
        const directCompletionsCount = await LeadActivity.countDocuments(compActMatch);

        return completed + directCompletionsCount;
      } catch (e) {
        return 0;
      }
    })();

    // 8. Recent Closed Leads
    const recentClosedPromise = Lead.find({
      $or: [wonLeadMatch, lostLeadMatch]
    })
      .sort({ closedAt: -1, updatedAt: -1 })
      .limit(10)
      .populate('closedBy', 'fullName username')
      .populate('currentOwner', 'fullName username')
      .lean();

    const [
      totalLeads,
      openLeads,
      wonLeads,
      lostLeads,
      upcomingFollowups,
      overdueFollowups,
      wonDealsAgg,
      sourcesAgg,
      dispositionsAgg,
      lostReasonsAgg,
      callsCount,
      walkInsCount,
      demosCount,
      completedDemos,
      demosNotDone,
      followUpsScheduled,
      followUpsCompleted,
      recentClosed
    ] = await Promise.all([
      totalLeadsPromise,
      openLeadsPromise,
      wonLeadsPromise,
      lostLeadsPromise,
      upcomingFollowupsPromise,
      overdueFollowupsPromise,
      wonDealsAggPromise,
      sourcesAggPromise,
      dispositionsAggPromise,
      lostReasonsAggPromise,
      callsCountPromise,
      walkInsCountPromise,
      demosCountPromise,
      completedDemosPromise,
      demosNotDonePromise,
      followUpsScheduledPromise,
      followUpsCompletedPromise,
      recentClosedPromise
    ]);

    const totalDealValue = wonDealsAgg[0]?.totalDealValue || 0;
    const avgDealValue = wonDealsAgg[0]?.avgDealValue ? Math.round(wonDealsAgg[0].avgDealValue) : 0;
    const closedCount = wonLeads + lostLeads;
    const conversionRate = closedCount > 0 ? Number(((wonLeads / closedCount) * 100).toFixed(1)) : 0;

    // Sources format with percentages
    const sources = sourcesAgg.map(s => ({
      source: s._id || 'Unknown',
      count: s.count,
      percentage: totalLeads > 0 ? Number(((s.count / totalLeads) * 100).toFixed(1)) : 0
    }));

    // Dispositions format
    const dispositions = dispositionsAgg.map(d => ({
      disposition: d._id,
      count: d.count,
      percentage: totalLeads > 0 ? Number(((d.count / totalLeads) * 100).toFixed(1)) : 0
    }));

    // Lost reasons format
    const lostReasons = lostReasonsAgg.map(r => ({
      reason: r._id,
      count: r.count,
      percentage: lostLeads > 0 ? Number(((r.count / lostLeads) * 100).toFixed(1)) : 0
    }));

    // 9. Date-wise Activity Report list initialization
    let dateList = [];
    if (effectiveStartStr && endStr) {
      const [esy, esm, esd] = effectiveStartStr.slice(0, 10).split('-').map(Number);
      const [ey, em, ed] = endStr.slice(0, 10).split('-').map(Number);
      const cur = new Date(Date.UTC(esy, esm - 1, esd));
      const last = new Date(Date.UTC(ey, em - 1, ed));
      while (cur <= last) {
        const y = cur.getUTCFullYear();
        const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
        const d = String(cur.getUTCDate()).padStart(2, '0');
        dateList.push(`${y}-${m}-${d}`);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    } else {
      const todayStr = getISTDateString(new Date());
      dateList = [todayStr];
    }

    // Fetch activity data for date-wise grouping and agent performance attribution
    const [
      callsInPeriod,
      walkInsInPeriod,
      demosInPeriod,
      wonLeadsInPeriod,
      lostLeadsInPeriod,
      followUpsCompInPeriod
    ] = await Promise.all([
      CallLog.find(callMatch).select('lead user calledAt createdAt followUpAt').lean(),
      WalkIn.find(activityMatch).select('createdAt walkInDate salesAgent assignedBy').lean(),
      Demo.find(activityMatch).select('createdAt demoDate status salesAgent assignedBy').lean(),
      Lead.find(wonLeadMatch).select('createdAt').lean(),
      Lead.find(lostLeadMatch).select('createdAt').lean(),
      LeadActivity.find({
        action: 'Follow-up Completed',
        ...(targetAgentId ? { performedBy: targetAgentId } : {}),
        ...(effectiveStart || end ? { createdAt: { ...(effectiveStart ? { $gte: effectiveStart } : {}), ...(end ? { $lte: end } : {}) } } : {})
      }).select('createdAt performedBy').lean()
    ]);

    // 10. Agent-Wise Performance Reporting
    const roleFilter = req.query.agentRole || req.query.role;
    let targetAgentsList = [];
    if (targetAgentId) {
      const singleAgent = await User.findById(targetAgentId)
        .select('fullName username agentRole role active')
        .lean();
      if (singleAgent) targetAgentsList = [singleAgent];
    } else {
      const agentQuery = { role: 'AGENT', active: true };
      if (roleFilter && roleFilter !== 'all') {
        agentQuery.agentRole = new RegExp(`^${roleFilter.trim()}$`, 'i');
      }
      targetAgentsList = await User.find(agentQuery)
        .select('fullName username agentRole role')
        .sort({ fullName: 1, username: 1 })
        .lean();
    }

    // Query all active agents to identify CRM-wide unassigned activities
    const allActiveAgents = await User.find({ role: 'AGENT', active: true }).select('_id').lean();
    const allActiveAgentIdSet = new Set(allActiveAgents.map(a => a._id.toString()));

    // Separate unassigned activities (missing owner or not in active agents)
    const unassignedCalls = callsInPeriod.filter(c => !c.user || !allActiveAgentIdSet.has(c.user.toString()));
    const unassignedWalkIns = walkInsInPeriod.filter(w => {
      const owner = w.salesAgent || w.assignedBy;
      return !owner || !allActiveAgentIdSet.has(owner.toString());
    });
    const unassignedDemos = demosInPeriod.filter(d => {
      const owner = d.salesAgent || d.assignedBy;
      return !owner || !allActiveAgentIdSet.has(owner.toString());
    });

    const unassignedDaily = dateList.map((dateKey) => {
      const callsLogged = unassignedCalls.filter(c => getISTDateString(c.calledAt || c.createdAt) === dateKey).length;
      const walkIns = unassignedWalkIns.filter(w => getISTDateString(w.createdAt) === dateKey).length;
      const demosOnDate = unassignedDemos.filter(d => getISTDateString(d.createdAt) === dateKey);
      return {
        date: dateKey,
        callsLogged,
        walkIns,
        demosScheduled: demosOnDate.length,
        demosCompleted: demosOnDate.filter(d => d.status === 'Done').length,
        demosNotDone: demosOnDate.filter(d => d.status === 'Not Done').length
      };
    });

    const unassignedActivities = {
      callsLogged: unassignedCalls.length,
      walkIns: unassignedWalkIns.length,
      demosScheduled: unassignedDemos.length,
      demosCompleted: unassignedDemos.filter(d => d.status === 'Done').length,
      demosNotDone: unassignedDemos.filter(d => d.status === 'Not Done').length,
      hasUnassigned: (unassignedCalls.length > 0 || unassignedWalkIns.length > 0 || unassignedDemos.length > 0),
      dailyBreakdown: unassignedDaily
    };

    // Build map for follow-ups completed
    const leadIdsInPeriod = [...new Set(callsInPeriod.map(c => c.lead ? c.lead.toString() : ''))].filter(Boolean);
    const priorsInPeriod = leadIdsInPeriod.length ? await CallLog.find({
      lead: { $in: leadIdsInPeriod },
      followUpAt: { $exists: true, $ne: null }
    }).select('lead user calledAt createdAt followUpAt').lean() : [];

    const datePriorMap = {};
    for (const p of priorsInPeriod) {
      const lid = p.lead.toString();
      if (!datePriorMap[lid]) datePriorMap[lid] = [];
      datePriorMap[lid].push(p);
    }

    const agentPerformance = await Promise.all(
      targetAgentsList.map(async (agent) => {
        const aId = agent._id;
        const aIdStr = aId.toString();

        // Exact attribution: Calls attributed to user
        const aCalls = callsInPeriod.filter(c => c.user && c.user.toString() === aIdStr);
        const callsLogged = aCalls.length;
        const followUpsScheduled = aCalls.filter(c => c.followUpAt != null).length;

        // Exact attribution: Demos attributed to salesAgent with fallback to assignedBy
        const aDemos = demosInPeriod.filter(d => {
          if (d.salesAgent) return d.salesAgent.toString() === aIdStr;
          return d.assignedBy && d.assignedBy.toString() === aIdStr;
        });
        const demosScheduled = aDemos.length;
        const demosCompleted = aDemos.filter(d => d.status === 'Done').length;
        const demosNotDone = aDemos.filter(d => d.status === 'Not Done').length;

        // Exact attribution: Walk-ins attributed to salesAgent with fallback to assignedBy
        const aWalkIns = walkInsInPeriod.filter(w => {
          if (w.salesAgent) return w.salesAgent.toString() === aIdStr;
          return w.assignedBy && w.assignedBy.toString() === aIdStr;
        });
        const walkIns = aWalkIns.length;

        // Outcomes: Won / Lost leads
        const isCalling = (agent.agentRole || '').toLowerCase().includes('calling');
        const aLeadFilter = isCalling
          ? { $or: [{ currentOwner: aId }, { createdBy: aId }] }
          : { currentOwner: aId };
        const aWonPromise = Lead.countDocuments(Object.assign({}, match, aLeadFilter, { closureStatus: 'WON' }));
        const aLostPromise = Lead.countDocuments(Object.assign({}, match, aLeadFilter, { closureStatus: 'LOST' }));

        // Follow-ups completed by this agent
        let aCompCount = 0;
        for (const call of aCalls) {
          if (!call.lead) continue;
          const lid = call.lead.toString();
          const scheds = datePriorMap[lid];
          if (scheds && scheds.some(s => s.calledAt < call.calledAt)) {
            aCompCount++;
          }
        }
        const directCompsByAgent = followUpsCompInPeriod.filter(a => a.performedBy && a.performedBy.toString() === aIdStr).length;
        const followUpsCompleted = aCompCount + directCompsByAgent;

        const [wonLeads, lostLeads] = await Promise.all([aWonPromise, aLostPromise]);

        // Daily breakdown for this agent
        const dailyBreakdown = dateList.map((dateKey) => {
          const cOnDate = aCalls.filter(c => getISTDateString(c.calledAt || c.createdAt) === dateKey).length;
          const wOnDate = aWalkIns.filter(w => getISTDateString(w.createdAt) === dateKey).length;
          const dOnDate = aDemos.filter(d => getISTDateString(d.createdAt) === dateKey);
          return {
            date: dateKey,
            callsLogged: cOnDate,
            walkIns: wOnDate,
            demosScheduled: dOnDate.length,
            demosCompleted: dOnDate.filter(d => d.status === 'Done').length,
            demosNotDone: dOnDate.filter(d => d.status === 'Not Done').length
          };
        });

        return {
          agentId: aId,
          agentName: agent.fullName || agent.username,
          agentRole: agent.agentRole || 'Agent',
          callsLogged,
          walkIns,
          demosScheduled,
          demosCompleted,
          demosNotDone,
          followUpsScheduled,
          followUpsCompleted,
          wonLeads,
          lostLeads,
          dailyBreakdown
        };
      })
    );

    const dateWiseReport = dateList.map((dateKey) => {
      // Calls on this date (in IST)
      const callsOnDate = callsInPeriod.filter((c) => {
        const time = c.calledAt || c.createdAt;
        const dStr = getISTDateString(time);
        return dStr === dateKey;
      });
      const callsLogged = callsOnDate.length;
      const followUpsScheduled = callsOnDate.filter((c) => c.followUpAt != null).length;

      let followUpsCompleted = 0;
      for (const call of callsOnDate) {
        if (!call.lead) continue;
        const lid = call.lead.toString();
        const priors = datePriorMap[lid];
        if (priors && priors.some((p) => p.calledAt < call.calledAt)) {
          followUpsCompleted++;
        }
      }

      const directCompsOnDate = followUpsCompInPeriod.filter((a) => {
        const dStr = getISTDateString(a.createdAt);
        return dStr === dateKey;
      }).length;
      followUpsCompleted += directCompsOnDate;

      // Walk-ins on this date (activity logged on date in IST)
      const walkIns = walkInsInPeriod.filter((w) => {
        const dStr = getISTDateString(w.createdAt);
        return dStr === dateKey;
      }).length;

      // Demos on this date (activity logged on date in IST)
      const demosOnDate = demosInPeriod.filter((d) => {
        const dStr = getISTDateString(d.createdAt);
        return dStr === dateKey;
      });
      const demosScheduled = demosOnDate.length;
      const demosCompleted = demosOnDate.filter((d) => d.status === 'Done').length;
      const demosNotDone = demosOnDate.filter((d) => d.status === 'Not Done').length;

      // Won & Lost leads on this date (in IST)
      const wonLeads = wonLeadsInPeriod.filter((l) => {
        const dStr = getISTDateString(l.createdAt);
        return dStr === dateKey;
      }).length;

      const lostLeads = lostLeadsInPeriod.filter((l) => {
        const dStr = getISTDateString(l.createdAt);
        return dStr === dateKey;
      }).length;

      return {
        date: dateKey,
        callsLogged,
        followUpsScheduled,
        followUpsCompleted,
        walkIns,
        demosScheduled,
        demosCompleted,
        demosNotDone,
        wonLeads,
        lostLeads
      };
      return {
        date: dateKey,
        callsLogged,
        followUpsScheduled,
        followUpsCompleted,
        walkIns,
        demosScheduled,
        demosCompleted,
        demosNotDone,
        wonLeads,
        lostLeads
      };
    });

    res.json({
      summary: {
        totalLeads,
        openLeads,
        wonLeads,
        lostLeads,
        totalDealValue,
        avgDealValue,
        conversionRate,
        upcomingFollowups,
        overdueFollowups,
        callsCount,
        walkInsCount,
        demosCount,
        completedDemos,
        demosNotDone,
        followUpsScheduled,
        followUpsCompleted,
      },
      effectiveRange: {
        startDate: effectiveStartStr,
        endDate: endStr,
        isCapped,
        originalStartDate: startStr,
        spanDays: totalSpanDays,
        maxDays: 366
      },
      selectedRole: roleFilter || '',
      agentPerformance,
      unassignedActivities,
      dateWiseReport,
      sources,
      dispositions,
      lostReasons,
      recentClosed,
    });
  } catch (err) {
    next(err);
  }
};

// -------------------------------------------------------------
// Daily Activity Report & Export (Requirements 1 - 7)
// -------------------------------------------------------------

function getDailyReportISTBoundaries(dateStr) {
  let y, m, d;
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    // Default to Yesterday in Asia/Kolkata
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const prev = new Date(Date.UTC(ty, tm - 1, td - 1));
    y = prev.getUTCFullYear();
    m = prev.getUTCMonth() + 1;
    d = prev.getUTCDate();
  } else {
    [y, m, d] = dateStr.trim().split('-').map(Number);
  }
  const selectedDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - IST_OFFSET_MS);
  return { selectedDate, start, end };
}

function formatISTDateTime(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatISTDateOnly(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function sanitizeExportCell(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (/^[=+\-@]/.test(s)) {
    return `'${s}`;
  }
  return s;
}

async function fetchDailyActivityData(dateStr) {
  const { selectedDate, start, end } = getDailyReportISTBoundaries(dateStr);

  const callMatch = {
    $or: [
      { calledAt: { $gte: start, $lte: end } },
      { calledAt: null, createdAt: { $gte: start, $lte: end } },
      { calledAt: { $exists: false }, createdAt: { $gte: start, $lte: end } }
    ]
  };

  const [callsInDay, demosInDay, walkInsInDay, wonLeads, lostLeads] = await Promise.all([
    CallLog.find(callMatch)
      .sort({ calledAt: -1, createdAt: -1 })
      .populate({
        path: 'lead',
        select: 'organizationName leadNumber closureStatus status currentOwner primaryContact nextFollowUpAt latestDemo latestWalkIn',
        populate: [
          { path: 'currentOwner', select: 'fullName username' },
          { path: 'primaryContact', select: 'name phone altPhone' }
        ]
      })
      .populate('user', 'fullName username agentRole')
      .populate('calledContact', 'name phone altPhone')
      .lean(),
    Demo.find({ demoDate: { $gte: start, $lte: end } })
      .populate('salesAgent', 'fullName username')
      .populate('assignedBy', 'fullName username')
      .populate('lead', 'organizationName leadNumber')
      .lean(),
    WalkIn.find({ walkInDate: { $gte: start, $lte: end } })
      .populate('salesAgent', 'fullName username')
      .populate('assignedBy', 'fullName username')
      .populate('lead', 'organizationName leadNumber')
      .lean(),
    Lead.find({
      closureStatus: 'WON',
      $or: [
        { closedAt: { $gte: start, $lte: end } },
        { closedAt: null, updatedAt: { $gte: start, $lte: end } },
        { closedAt: { $exists: false }, updatedAt: { $gte: start, $lte: end } }
      ]
    }).select('leadNumber organizationName dealValue product closedAt currentOwner').populate('currentOwner', 'fullName username').lean(),
    Lead.find({
      closureStatus: 'LOST',
      $or: [
        { closedAt: { $gte: start, $lte: end } },
        { closedAt: null, updatedAt: { $gte: start, $lte: end } },
        { closedAt: { $exists: false }, updatedAt: { $gte: start, $lte: end } }
      ]
    }).select('leadNumber organizationName lostReason closedAt currentOwner').populate('currentOwner', 'fullName username').lean(),
  ]);

  const uniqueHospitalIdSet = new Set();
  callsInDay.forEach((c) => {
    if (c.lead?._id) uniqueHospitalIdSet.add(c.lead._id.toString());
  });
  const uniqueHospitalsCalled = uniqueHospitalIdSet.size;

  // Demos Breakdown
  const demosScheduled = demosInDay.length;
  const demosCompleted = demosInDay.filter(d => ['Done', 'Completed'].includes(d.status)).length;
  const demosNotDone = demosInDay.filter(d => d.status === 'Not Done').length;

  // Walk-ins Breakdown
  const walkInsScheduled = walkInsInDay.length;
  const walkInsCompleted = walkInsInDay.filter(w => ['Done', 'Completed'].includes(w.status)).length;
  const walkInsNotCompleted = walkInsInDay.filter(w => w.status === 'Not Done').length;

  // Closures
  const leadsWon = wonLeads.length;
  const leadsLost = lostLeads.length;

  // Follow-up Tracking & Deduplication (Point 1)
  const leadIdsCalled = [...uniqueHospitalIdSet];
  const priorFollowUpCalls = leadIdsCalled.length ? await CallLog.find({
    lead: { $in: leadIdsCalled },
    followUpAt: { $exists: true, $ne: null }
  }).select('lead calledAt followUpAt').lean() : [];

  const completedFollowUpLeadSet = new Set();
  const callsIdentifiedAsFollowUps = new Set();

  for (const call of callsInDay) {
    if (!call.lead?._id) continue;
    const lid = call.lead._id.toString();
    const callTime = call.calledAt ? new Date(call.calledAt).getTime() : new Date(call.createdAt).getTime();
    const hadPriorFollowUp = priorFollowUpCalls.some((p) => {
      if (p.lead.toString() !== lid) return false;
      const pCallTime = p.calledAt ? new Date(p.calledAt).getTime() : 0;
      return pCallTime < callTime && p.followUpAt != null;
    });
    if (hadPriorFollowUp) {
      completedFollowUpLeadSet.add(lid);
      callsIdentifiedAsFollowUps.add(call._id.toString());
    }
  }

  // Direct completions from LeadActivity
  const directCompletions = await LeadActivity.find({
    action: 'Follow-up Completed',
    createdAt: { $gte: start, $lte: end }
  }).select('lead').lean();
  directCompletions.forEach(a => {
    if (a.lead) completedFollowUpLeadSet.add(a.lead.toString());
  });

  // FollowUp documents marked Done/Completed
  const doneFollowUpDocs = await FollowUp.find({
    status: { $in: ['Done', 'Completed'] },
    updatedAt: { $gte: start, $lte: end }
  }).select('lead').lean();
  doneFollowUpDocs.forEach(f => {
    if (f.lead) completedFollowUpLeadSet.add(f.lead.toString());
  });

  const followUpsCompleted = completedFollowUpLeadSet.size;

  // Follow-ups Scheduled on Day D
  const followUpScheduledLeadSet = new Set();
  callsInDay.filter(c => c.followUpAt != null).forEach(c => {
    if (c.lead?._id) followUpScheduledLeadSet.add(c.lead._id.toString());
  });
  const followUpsCreatedDocs = await FollowUp.find({ createdAt: { $gte: start, $lte: end } }).select('lead').lean();
  followUpsCreatedDocs.forEach(f => {
    if (f.lead) followUpScheduledLeadSet.add(f.lead.toString());
  });
  const followUpsScheduled = followUpScheduledLeadSet.size;

  // Follow-ups Pending for Day D (target date falling on Day D, but not completed on Day D)
  const leadsDueOnDay = await Lead.find({
    closureStatus: 'OPEN',
    nextFollowUpAt: { $gte: start, $lte: end }
  }).select('_id').lean();
  const pendingLeads = leadsDueOnDay.filter(l => !completedFollowUpLeadSet.has(l._id.toString()));
  const followUpsPending = pendingLeads.length;

  // Follow-ups Overdue as of Day D (due on or before end of Day D, on OPEN leads, incomplete)
  const overdueLeads = await Lead.find({
    closureStatus: 'OPEN',
    nextFollowUpAt: { $lt: end, $gt: new Date(0) }
  }).select('_id').lean();
  const overdueLeadsUnfinished = overdueLeads.filter(l => !completedFollowUpLeadSet.has(l._id.toString()));
  const followUpsOverdue = overdueLeadsUnfinished.length;

  // Detailed Hospital Activity Rows
  const hospitalActivity = callsInDay.map((call, idx) => {
    const hospitalName = call.lead?.organizationName || 'N/A';
    const hospitalPhone = call.calledContact?.phone || call.lead?.primaryContact?.phone || 'N/A';
    const contactPerson = call.calledContact?.name || call.lead?.primaryContact?.name || 'N/A';
    const callDateTime = formatISTDateTime(call.calledAt || call.createdAt);
    const callDateRaw = (call.calledAt || call.createdAt);
    const callerName = call.user?.fullName || call.user?.username || 'N/A';
    const callerRole = call.user?.agentRole || 'Calling Agent';
    const disposition = call.disposition || 'N/A';
    const remarks = (call.remark && call.remark.trim()) || 'N/A';
    const currentLeadStatus = call.lead?.closureStatus || 'OPEN';

    let nextFollowUpDate = 'N/A';
    let followUpStatus = 'N/A';
    const fuTime = call.followUpAt || call.lead?.nextFollowUpAt;
    if (fuTime) {
      nextFollowUpDate = formatISTDateTime(fuTime);
      const fuDate = new Date(fuTime);
      const now = new Date();
      if (call.lead?._id && completedFollowUpLeadSet.has(call.lead._id.toString())) {
        followUpStatus = 'Completed';
      } else if (fuDate < now) {
        followUpStatus = 'Overdue';
      } else {
        followUpStatus = 'Pending';
      }
    } else if (callsIdentifiedAsFollowUps.has(call._id.toString())) {
      followUpStatus = 'Completed';
    }

    let demoStatus = 'N/A';
    if (call.lead?.latestDemo?.demoDate) {
      demoStatus = `${formatISTDateOnly(call.lead.latestDemo.demoDate)} (${call.lead.latestDemo.status || 'Planned'})`;
    }

    let walkInStatus = 'N/A';
    if (call.lead?.latestWalkIn?.walkInDate) {
      walkInStatus = `${formatISTDateOnly(call.lead.latestWalkIn.walkInDate)} (${call.lead.latestWalkIn.status || 'Planned'})`;
    }

    const currentAssignedAgent = call.lead?.currentOwner?.fullName || call.lead?.currentOwner?.username || 'Unassigned';

    return {
      id: call._id?.toString() || `call-${idx}`,
      leadNumber: call.lead?.leadNumber || 'N/A',
      leadId: call.lead?._id?.toString() || '',
      hospitalName,
      hospitalPhone,
      contactPerson,
      callDateTime,
      callDateRaw,
      callerName,
      callerRole,
      disposition,
      remarks,
      currentLeadStatus,
      nextFollowUpDate,
      followUpStatus,
      demoStatus,
      walkInStatus,
      currentAssignedAgent,
    };
  });

  const summary = {
    selectedDate,
    totalCalls: callsInDay.length,
    uniqueHospitalsCalled,
    followUpsCompleted,
    followUpsPending,
    followUpsOverdue,
    followUpsScheduled,
    demosScheduled,
    demosCompleted,
    demosNotDone,
    walkInsScheduled,
    walkInsCompleted,
    walkInsNotCompleted,
    leadsWon,
    leadsLost,
  };

  return {
    selectedDate,
    summary,
    hospitalActivity,
    demos: demosInDay.map(d => ({
      leadNumber: d.lead?.leadNumber || 'N/A',
      hospitalName: d.lead?.organizationName || 'N/A',
      agentName: d.salesAgent?.fullName || d.salesAgent?.username || 'N/A',
      scheduledBy: d.assignedBy?.fullName || d.assignedBy?.username || 'N/A',
      demoDate: formatISTDateOnly(d.demoDate),
      demoTime: d.demoTime || 'N/A',
      status: d.status || 'Planned',
      remarks: d.remarks || 'N/A'
    })),
    walkIns: walkInsInDay.map(w => ({
      leadNumber: w.lead?.leadNumber || 'N/A',
      hospitalName: w.lead?.organizationName || 'N/A',
      agentName: w.salesAgent?.fullName || w.salesAgent?.username || 'N/A',
      scheduledBy: w.assignedBy?.fullName || w.assignedBy?.username || 'N/A',
      walkInDate: formatISTDateOnly(w.walkInDate),
      walkInTime: w.walkInTime || 'N/A',
      status: w.status || 'Planned',
      remarks: w.remark || 'N/A'
    })),
    wonLeads: wonLeads.map(l => ({
      leadNumber: l.leadNumber || 'N/A',
      hospitalName: l.organizationName || 'N/A',
      dealValue: l.dealValue || 0,
      product: l.product || 'N/A',
      closedAt: formatISTDateTime(l.closedAt),
      owner: l.currentOwner?.fullName || l.currentOwner?.username || 'Unassigned'
    })),
    lostLeads: lostLeads.map(l => ({
      leadNumber: l.leadNumber || 'N/A',
      hospitalName: l.organizationName || 'N/A',
      lostReason: l.lostReason || 'N/A',
      closedAt: formatISTDateTime(l.closedAt),
      owner: l.currentOwner?.fullName || l.currentOwner?.username || 'Unassigned'
    })),
  };
}

exports.dailyActivityReport = async (req, res, next) => {
  try {
    const reportData = await fetchDailyActivityData(req.query.date);
    res.json(reportData);
  } catch (err) {
    next(err);
  }
};

exports.exportDailyActivityReport = async (req, res, next) => {
  try {
    const format = (req.query.format || 'xlsx').toLowerCase();
    const data = await fetchDailyActivityData(req.query.date);
    const { selectedDate, summary, hospitalActivity, demos, walkIns, wonLeads, lostLeads } = data;

    if (format === 'csv') {
      const headers = [
        'Hospital Name',
        'Hospital Contact Number',
        'Call Date and Time (IST)',
        'Caller / Agent Name',
        'Call Disposition / Outcome',
        'Complete Call Remarks / Notes',
        'Current Lead Status',
        'Next Follow-up Date and Time',
        'Follow-up Status',
        'Demo Date and Status',
        'Walk-in Date and Status',
        'Current Assigned Agent'
      ];
      const rows = hospitalActivity.map(r => [
        sanitizeExportCell(r.hospitalName),
        sanitizeExportCell(r.hospitalPhone),
        sanitizeExportCell(r.callDateTime),
        sanitizeExportCell(r.callerName),
        sanitizeExportCell(r.disposition),
        sanitizeExportCell(r.remarks),
        sanitizeExportCell(r.currentLeadStatus),
        sanitizeExportCell(r.nextFollowUpDate),
        sanitizeExportCell(r.followUpStatus),
        sanitizeExportCell(r.demoStatus),
        sanitizeExportCell(r.walkInStatus),
        sanitizeExportCell(r.currentAssignedAgent)
      ]);
      const csvContent = '\uFEFF' + [
        headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
        ...rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      ].join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="daily_activity_report_${selectedDate}.csv"`);
      return res.status(200).send(csvContent);
    }

    // Default: Multi-sheet Excel (.xlsx)
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary Sheet
    const summarySheetRows = [
      { Metric: 'Report Date (IST)', Value: selectedDate },
      { Metric: 'Generated At (IST)', Value: formatISTDateTime(new Date()) },
      { Metric: 'Total Calls Made', Value: summary.totalCalls },
      { Metric: 'Unique Hospitals Called', Value: summary.uniqueHospitalsCalled },
      { Metric: 'Follow-ups Completed', Value: summary.followUpsCompleted },
      { Metric: 'Follow-ups Pending', Value: summary.followUpsPending },
      { Metric: 'Follow-ups Overdue', Value: summary.followUpsOverdue },
      { Metric: 'Follow-ups Scheduled / Fixed', Value: summary.followUpsScheduled },
      { Metric: 'Demos Scheduled / Fixed', Value: summary.demosScheduled },
      { Metric: 'Demos Completed', Value: summary.demosCompleted },
      { Metric: 'Demos Not Done', Value: summary.demosNotDone },
      { Metric: 'Walk-ins Scheduled', Value: summary.walkInsScheduled },
      { Metric: 'Walk-ins Completed', Value: summary.walkInsCompleted },
      { Metric: 'Walk-ins Not Completed', Value: summary.walkInsNotCompleted },
      { Metric: 'Leads Won', Value: summary.leadsWon },
      { Metric: 'Leads Lost', Value: summary.leadsLost },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summarySheetRows);
    wsSummary['!cols'] = [{ wch: 32 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Daily Summary');

    // Sheet 2: Hospital-Wise Activity Sheet
    const activitySheetRows = hospitalActivity.map(r => ({
      'Hospital Name': sanitizeExportCell(r.hospitalName),
      'Hospital Contact Number': sanitizeExportCell(r.hospitalPhone),
      'Call Date & Time (IST)': sanitizeExportCell(r.callDateTime),
      'Caller / Agent Name': sanitizeExportCell(r.callerName),
      'Call Disposition / Outcome': sanitizeExportCell(r.disposition),
      'Complete Call Remarks / Notes': sanitizeExportCell(r.remarks),
      'Current Lead Status': sanitizeExportCell(r.currentLeadStatus),
      'Next Follow-up Date & Time': sanitizeExportCell(r.nextFollowUpDate),
      'Follow-up Status': sanitizeExportCell(r.followUpStatus),
      'Demo Date & Status': sanitizeExportCell(r.demoStatus),
      'Walk-in Date & Status': sanitizeExportCell(r.walkInStatus),
      'Current Assigned Agent': sanitizeExportCell(r.currentAssignedAgent),
    }));
    const wsActivity = XLSX.utils.json_to_sheet(activitySheetRows.length ? activitySheetRows : [{ Note: 'No calls recorded for this date' }]);
    wsActivity['!cols'] = [
      { wch: 28 }, // Hospital Name
      { wch: 18 }, // Contact Number
      { wch: 22 }, // Call Date & Time
      { wch: 20 }, // Caller Name
      { wch: 22 }, // Disposition
      { wch: 45 }, // Remarks
      { wch: 16 }, // Status
      { wch: 22 }, // Next Follow-up
      { wch: 16 }, // Follow-up Status
      { wch: 22 }, // Demo Status
      { wch: 22 }, // Walk-in Status
      { wch: 22 }, // Assigned Agent
    ];
    XLSX.utils.book_append_sheet(wb, wsActivity, 'Hospital Activity');

    // Sheet 3: Demos, Walk-ins & Closures
    const milestonesRows = [];
    demos.forEach(d => {
      milestonesRows.push({
        'Activity Type': 'Demo',
        'Lead Number': d.leadNumber,
        'Hospital Name': d.hospitalName,
        'Assigned Agent': d.agentName,
        'Scheduled By': d.scheduledBy,
        'Scheduled Date': d.demoDate,
        'Scheduled Time': d.demoTime,
        'Status': d.status,
        'Remarks': d.remarks
      });
    });
    walkIns.forEach(w => {
      milestonesRows.push({
        'Activity Type': 'Walk-in',
        'Lead Number': w.leadNumber,
        'Hospital Name': w.hospitalName,
        'Assigned Agent': w.agentName,
        'Scheduled By': w.scheduledBy,
        'Scheduled Date': w.walkInDate,
        'Scheduled Time': w.walkInTime,
        'Status': w.status,
        'Remarks': w.remarks
      });
    });
    wonLeads.forEach(w => {
      milestonesRows.push({
        'Activity Type': 'Lead Won',
        'Lead Number': w.leadNumber,
        'Hospital Name': w.hospitalName,
        'Assigned Agent': w.owner,
        'Scheduled By': 'N/A',
        'Scheduled Date': w.closedAt,
        'Scheduled Time': 'N/A',
        'Status': 'WON',
        'Remarks': `Deal Value: ₹${w.dealValue || 0} (${w.product || 'N/A'})`
      });
    });
    lostLeads.forEach(l => {
      milestonesRows.push({
        'Activity Type': 'Lead Lost',
        'Lead Number': l.leadNumber,
        'Hospital Name': l.hospitalName,
        'Assigned Agent': l.owner,
        'Scheduled By': 'N/A',
        'Scheduled Date': l.closedAt,
        'Scheduled Time': 'N/A',
        'Status': 'LOST',
        'Remarks': `Lost Reason: ${l.lostReason || 'N/A'}`
      });
    });
    const wsMilestones = XLSX.utils.json_to_sheet(milestonesRows.length ? milestonesRows : [{ Note: 'No demos, walk-ins, or closures on this date' }]);
    wsMilestones['!cols'] = [
      { wch: 14 },
      { wch: 14 },
      { wch: 28 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 14 },
      { wch: 14 },
      { wch: 40 },
    ];
    XLSX.utils.book_append_sheet(wb, wsMilestones, 'Demos WalkIns & Closures');

    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="daily_activity_report_${selectedDate}.xlsx"`);
    res.setHeader('Content-Length', excelBuffer.length);
    return res.status(200).send(excelBuffer);
  } catch (err) {
    next(err);
  }
};
