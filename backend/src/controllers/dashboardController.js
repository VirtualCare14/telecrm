const mongoose = require('mongoose');
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

function getBackendDateRangeFromFilter(filter) {
  if (!filter) return {};
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [y, m, d] = todayStr.split('-').map(Number);
  switch (filter) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr };
    case 'yesterday': {
      const prev = new Date(Date.UTC(y, m - 1, d - 1));
      const py = prev.getUTCFullYear();
      const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
      const pd = String(prev.getUTCDate()).padStart(2, '0');
      return { startDate: `${py}-${pm}-${pd}`, endDate: `${py}-${pm}-${pd}` };
    }
    case 'last7': {
      const prev = new Date(Date.UTC(y, m - 1, d - 6));
      const py = prev.getUTCFullYear();
      const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
      const pd = String(prev.getUTCDate()).padStart(2, '0');
      return { startDate: `${py}-${pm}-${pd}`, endDate: todayStr };
    }
    case 'last30': {
      const prev = new Date(Date.UTC(y, m - 1, d - 29));
      const py = prev.getUTCFullYear();
      const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
      const pd = String(prev.getUTCDate()).padStart(2, '0');
      return { startDate: `${py}-${pm}-${pd}`, endDate: todayStr };
    }
    case 'thisMonth': {
      const monthStartStr = `${y}-${String(m).padStart(2, '0')}-01`;
      return { startDate: monthStartStr, endDate: todayStr };
    }
    default:
      return {};
  }
}

function parseDateRange(query) {
  let startDate = query.startDate || query.start;
  let endDate = query.endDate || query.end;
  if (!startDate && !endDate) {
    if (query.dateFilter) {
      const range = getBackendDateRangeFromFilter(query.dateFilter);
      if (range.startDate) startDate = range.startDate;
      if (range.endDate) endDate = range.endDate;
    }
    const monthInput = query.month || query.selectedMonth;
    if (!startDate && !endDate && monthInput && /^\d{4}-\d{2}$/.test(monthInput)) {
      const [my, mm] = monthInput.split('-').map(Number);
      const lastDay = new Date(Date.UTC(my, mm, 0)).getUTCDate();
      startDate = `${monthInput}-01`;
      endDate = `${monthInput}-${String(lastDay).padStart(2, '0')}`;
    }
    const singleInput = query.date || query.singleDate;
    if (!startDate && !endDate && singleInput && /^\d{4}-\d{2}-\d{2}$/.test(singleInput)) {
      startDate = singleInput;
      endDate = singleInput;
    }
  }
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

    // Lead filter based on agent ownership / scope (includes currentOwner and createdBy)
    const agentLeadMatch = {};
    if (targetAgentId) {
      agentLeadMatch.$or = [{ currentOwner: targetAgentId }, { createdBy: targetAgentId }];
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
      ...(targetAgentId ? { $or: [{ currentOwner: targetAgentId }, { createdBy: targetAgentId }, { closedBy: targetAgentId }] } : {})
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
      ...(targetAgentId ? { $or: [{ currentOwner: targetAgentId }, { createdBy: targetAgentId }, { closedBy: targetAgentId }] } : {})
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
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const startOfToday = new Date(Date.UTC(ty, tm - 1, td, 0, 0, 0, 0) - IST_OFFSET_MS);
    const endOfToday = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999) - IST_OFFSET_MS);

    const { start, end } = parseDateRange(req.query);
    const actStart = start || startOfToday;
    const actEnd = end || endOfToday;

    const matchOwner = { $or: [{ currentOwner: ownerObjId }, { createdBy: ownerObjId }] };

    // Get lead IDs owned/created by agent for cross-referencing activities
    const agentLeads = await Lead.find(matchOwner).select('_id').lean();
    const agentLeadIds = agentLeads.map(l => l._id);

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

    // 5. Today's Scheduled Demos
    const todayDemosPromise = Demo.countDocuments({
      $or: [
        { salesAgent: ownerObjId },
        { assignedBy: ownerObjId },
        ...(agentLeadIds.length ? [{ lead: { $in: agentLeadIds } }] : [])
      ],
      demoDate: { $gte: startOfToday, $lte: endOfToday }
    });

    // 6. Today's Walk-ins (Scheduled for today)
    const todayWalkInsPromise = WalkIn.countDocuments({
      $or: [
        { salesAgent: ownerObjId },
        { assignedBy: ownerObjId },
        { lead: { $in: agentLeadIds } }
      ],
      walkInDate: { $gte: startOfToday, $lte: endOfToday }
    });

    // 7. Won Leads
    const wonLeadsPromise = Lead.countDocuments({ ...matchOwner, closureStatus: 'WON' });

    // 8. Lost Leads
    const lostLeadsPromise = Lead.countDocuments({ ...matchOwner, closureStatus: 'LOST' });

    // --- Dynamic Activity Metrics for selected date range [actStart, actEnd] ---
    // Calls in range
    const callMatch = {
      $or: [
        { user: ownerObjId },
        { calledBy: ownerObjId },
        ...(agentLeadIds.length ? [{ lead: { $in: agentLeadIds } }] : [])
      ],
      calledAt: { $gte: actStart, $lte: actEnd }
    };
    const dailyCallsPromise = CallLog.countDocuments(callMatch);

    // Demos Scheduled & Completed in range
    const demoFilter = {
      $or: [
        { salesAgent: ownerObjId },
        { assignedBy: ownerObjId },
        ...(agentLeadIds.length ? [{ lead: { $in: agentLeadIds } }] : [])
      ],
      demoDate: { $gte: actStart, $lte: actEnd }
    };
    const dailyDemosScheduledPromise = Demo.countDocuments(demoFilter);
    const dailyDemosCompletedPromise = Demo.countDocuments({
      ...demoFilter,
      status: { $in: ['Done', 'Completed'] }
    });

    // Walk-ins Scheduled & Completed in range
    const walkInFilter = {
      $or: [
        { salesAgent: ownerObjId },
        { assignedBy: ownerObjId },
        ...(agentLeadIds.length ? [{ lead: { $in: agentLeadIds } }] : [])
      ],
      walkInDate: { $gte: actStart, $lte: actEnd }
    };
    const dailyWalkinsScheduledPromise = WalkIn.countDocuments(walkInFilter);
    const dailyWalkinsCompletedPromise = WalkIn.countDocuments({
      ...walkInFilter,
      status: { $in: ['Done', 'Completed'] }
    });

    // Sales Follow-ups in range
    const fuFilter = {
      $or: [
        { salesAgent: ownerObjId },
        { assignedBy: ownerObjId },
        ...(agentLeadIds.length ? [{ lead: { $in: agentLeadIds } }] : [])
      ],
      followUpDate: { $gte: actStart, $lte: actEnd }
    };
    const dailySalesFollowupsPromise = FollowUp.countDocuments(fuFilter);

    // Follow-ups in range (from FollowUp docs and Lead.nextFollowUpAt)
    const dailyFollowupsPromise = (async () => {
      try {
        const fuDocs = await FollowUp.find(fuFilter).select('_id lead').lean();
        const fuLeadIds = fuDocs.map(f => f.lead ? f.lead.toString() : f._id.toString());

        const leadFuMatch = {
          ...matchOwner,
          closureStatus: 'OPEN',
          nextFollowUpAt: { $gte: actStart, $lte: actEnd }
        };
        const leadsWithFu = await Lead.find(leadFuMatch).select('_id').lean();
        const leadIdsWithFu = leadsWithFu.map(l => l._id.toString());

        const combined = new Set([...fuLeadIds, ...leadIdsWithFu]);
        return combined.size;
      } catch (err) {
        return 0;
      }
    })();

    // Overdue Follow-ups in range
    const overdueLimit = (actEnd && actEnd < now) ? actEnd : now;
    let dailyOverdueFollowupsPromise = Promise.resolve(0);
    if (!(actStart && actStart >= now)) {
      const overdueLeadMatch = {
        ...matchOwner,
        closureStatus: 'OPEN',
        nextFollowUpAt: { $lt: overdueLimit, $gt: new Date(0), ...(actStart ? { $gte: actStart } : {}) }
      };
      dailyOverdueFollowupsPromise = Lead.countDocuments(overdueLeadMatch);
    }

    // Won Leads in range
    const wonMatch = {
      ...matchOwner,
      closureStatus: 'WON',
      $or: [
        { closedAt: { $gte: actStart, $lte: actEnd } },
        { closedAt: null, updatedAt: { $gte: actStart, $lte: actEnd } },
        { closedAt: { $exists: false }, updatedAt: { $gte: actStart, $lte: actEnd } }
      ]
    };
    const dailyWonPromise = Lead.countDocuments(wonMatch);

    // Lost Leads in range
    const lostMatch = {
      ...matchOwner,
      closureStatus: 'LOST',
      $or: [
        { closedAt: { $gte: actStart, $lte: actEnd } },
        { closedAt: null, updatedAt: { $gte: actStart, $lte: actEnd } },
        { closedAt: { $exists: false }, updatedAt: { $gte: actStart, $lte: actEnd } }
      ]
    };
    const dailyLostPromise = Lead.countDocuments(lostMatch);

    // New Leads created in range
    const newLeadsMatch = {
      ...matchOwner,
      createdAt: { $gte: actStart, $lte: actEnd }
    };
    const dailyNewLeadsPromise = Lead.countDocuments(newLeadsMatch);

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

    // Today's Walk-in Leads (Scheduled for today)
    const todayWalkInLeadsPromise = WalkIn.find({
      $or: [
        { salesAgent: ownerObjId },
        { assignedBy: ownerObjId },
        { lead: { $in: agentLeadIds } }
      ],
      walkInDate: { $gte: startOfToday, $lte: endOfToday }
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
      .sort({ createdAt: -1, _id: -1 })
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
      dailyCalls,
      dailyDemosScheduled,
      dailyDemosCompleted,
      dailyWalkinsScheduled,
      dailyWalkinsCompleted,
      dailySalesFollowups,
      dailyFollowups,
      dailyOverdueFollowups,
      dailyWon,
      dailyLost,
      dailyNewLeads,
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
      dailyCallsPromise,
      dailyDemosScheduledPromise,
      dailyDemosCompletedPromise,
      dailyWalkinsScheduledPromise,
      dailyWalkinsCompletedPromise,
      dailySalesFollowupsPromise,
      dailyFollowupsPromise,
      dailyOverdueFollowupsPromise,
      dailyWonPromise,
      dailyLostPromise,
      dailyNewLeadsPromise,
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
        won: dailyWon || 0,
        lost: dailyLost || 0,
        newLeads: dailyNewLeads || 0,
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
    const roleFilter = req.query.agentRole || req.query.role;

    const mongoose = require('mongoose');
    const match = {};
    let targetAgentId = null;
    let roleAgentIds = null;

    if (roleFilter && roleFilter !== 'all') {
      const matchingRoleAgents = await User.find({
        role: 'AGENT',
        agentRole: new RegExp(`^${roleFilter.trim()}$`, 'i')
      }).select('_id').lean();
      roleAgentIds = matchingRoleAgents.map(a => a._id);
    }

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
        match.$or = [{ currentOwner: targetAgentId }, { createdBy: targetAgentId }];
      }
    } else if (roleAgentIds !== null) {
      match.$or = [{ currentOwner: { $in: roleAgentIds } }, { createdBy: { $in: roleAgentIds } }];
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
    } else if (roleAgentIds !== null) {
      activityMatch.$or = [
        { salesAgent: { $in: roleAgentIds } },
        { salesAgent: null, assignedBy: { $in: roleAgentIds } },
        { salesAgent: { $exists: false }, assignedBy: { $in: roleAgentIds } }
      ];
    }
    if (effectiveStart || end) {
      activityMatch.createdAt = {};
      if (effectiveStart) activityMatch.createdAt.$gte = effectiveStart;
      if (end) activityMatch.createdAt.$lte = end;
    }
    const callMatch = {};
    if (targetAgentId) {
      callMatch.user = targetAgentId;
    } else if (roleAgentIds !== null) {
      callMatch.user = { $in: roleAgentIds };
    }
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

    // Walk-ins: Count ONLY actual hospital on-site walk-in visits genuinely logged/completed ('Done' or 'Completed')
    const walkInCompletedMatch = {
      status: { $in: ['Done', 'Completed'] }
    };
    if (effectiveStart || end) {
      const dateCond = {};
      if (effectiveStart) dateCond.$gte = effectiveStart;
      if (end) dateCond.$lte = end;
      walkInCompletedMatch.$or = [
        { locationCapturedAt: dateCond },
        { locationCapturedAt: null, walkInDate: dateCond },
        { locationCapturedAt: { $exists: false }, walkInDate: dateCond }
      ];
    }
    if (targetAgentId) {
      walkInCompletedMatch.$and = walkInCompletedMatch.$and || [];
      walkInCompletedMatch.$and.push({
        $or: [
          { salesAgent: targetAgentId },
          { salesAgent: null, assignedBy: targetAgentId },
          { salesAgent: { $exists: false }, assignedBy: targetAgentId }
        ]
      });
    } else if (roleAgentIds !== null) {
      walkInCompletedMatch.$and = walkInCompletedMatch.$and || [];
      walkInCompletedMatch.$and.push({
        $or: [
          { salesAgent: { $in: roleAgentIds } },
          { salesAgent: null, assignedBy: { $in: roleAgentIds } },
          { salesAgent: { $exists: false }, assignedBy: { $in: roleAgentIds } }
        ]
      });
    }

    // Walk-ins Scheduled (Planned visits scheduled for this period)
    const walkInScheduledMatch = {
      status: 'Planned'
    };
    if (effectiveStart || end) {
      const dateCond = {};
      if (effectiveStart) dateCond.$gte = effectiveStart;
      if (end) dateCond.$lte = end;
      walkInScheduledMatch.walkInDate = dateCond;
    }
    if (targetAgentId) {
      walkInScheduledMatch.$and = walkInScheduledMatch.$and || [];
      walkInScheduledMatch.$and.push({
        $or: [
          { salesAgent: targetAgentId },
          { salesAgent: null, assignedBy: targetAgentId },
          { salesAgent: { $exists: false }, assignedBy: targetAgentId }
        ]
      });
    } else if (roleAgentIds !== null) {
      walkInScheduledMatch.$and = walkInScheduledMatch.$and || [];
      walkInScheduledMatch.$and.push({
        $or: [
          { salesAgent: { $in: roleAgentIds } },
          { salesAgent: null, assignedBy: { $in: roleAgentIds } },
          { salesAgent: { $exists: false }, assignedBy: { $in: roleAgentIds } }
        ]
      });
    }

    const callsCountPromise = CallLog.countDocuments(callMatch);
    const walkInsCountPromise = WalkIn.countDocuments(walkInCompletedMatch);
    const walkInsScheduledPromise = WalkIn.countDocuments(walkInScheduledMatch);
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
      walkInsScheduled,
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
      walkInsScheduledPromise,
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
      WalkIn.find(walkInCompletedMatch).select('createdAt walkInDate locationCapturedAt status salesAgent assignedBy').lean(),
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
      const walkIns = unassignedWalkIns.filter(w => {
        const visitTime = w.locationCapturedAt || w.walkInDate;
        return getISTDateString(visitTime) === dateKey;
      }).length;
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
        const aLeadFilter = { $or: [{ currentOwner: aId }, { createdBy: aId }] };
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
          const wOnDate = aWalkIns.filter(w => {
            const visitTime = w.locationCapturedAt || w.walkInDate;
            return getISTDateString(visitTime) === dateKey;
          }).length;
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

      // Walk-ins conducted on this date (in IST)
      const walkIns = walkInsInPeriod.filter((w) => {
        const visitTime = w.locationCapturedAt || w.walkInDate;
        return getISTDateString(visitTime) === dateKey;
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
        walkInsScheduled,
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

async function fetchDailyActivityData(dateStr, queryParams = {}) {
  const { selectedDate, start, end } = getDailyReportISTBoundaries(dateStr);

  const agentFilter = queryParams.agentId || queryParams.agent || queryParams.owner;
  const roleFilter = queryParams.agentRole || queryParams.role;

  let targetAgentId = null;
  let roleAgentIds = null;

  if (roleFilter && roleFilter !== 'all') {
    const matchingRoleAgents = await User.find({
      role: 'AGENT',
      agentRole: new RegExp(`^${roleFilter.trim()}$`, 'i')
    }).select('_id').lean();
    roleAgentIds = matchingRoleAgents.map(a => a._id);
  }

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
  }

  const walkInAgentMatch = {};
  if (targetAgentId) {
    walkInAgentMatch.$or = [
      { salesAgent: targetAgentId },
      { salesAgent: null, assignedBy: targetAgentId },
      { salesAgent: { $exists: false }, assignedBy: targetAgentId }
    ];
  } else if (roleAgentIds !== null) {
    walkInAgentMatch.$or = [
      { salesAgent: { $in: roleAgentIds } },
      { salesAgent: null, assignedBy: { $in: roleAgentIds } },
      { salesAgent: { $exists: false }, assignedBy: { $in: roleAgentIds } }
    ];
  }

  const callMatch = {
    $or: [
      { calledAt: { $gte: start, $lte: end } },
      { calledAt: null, createdAt: { $gte: start, $lte: end } },
      { calledAt: { $exists: false }, createdAt: { $gte: start, $lte: end } }
    ]
  };
  if (targetAgentId) {
    callMatch.user = targetAgentId;
  } else if (roleAgentIds !== null) {
    callMatch.user = { $in: roleAgentIds };
  }

  const demoMatch = { demoDate: { $gte: start, $lte: end } };
  if (targetAgentId) {
    demoMatch.$or = [
      { salesAgent: targetAgentId },
      { salesAgent: null, assignedBy: targetAgentId },
      { salesAgent: { $exists: false }, assignedBy: targetAgentId }
    ];
  } else if (roleAgentIds !== null) {
    demoMatch.$or = [
      { salesAgent: { $in: roleAgentIds } },
      { salesAgent: null, assignedBy: { $in: roleAgentIds } },
      { salesAgent: { $exists: false }, assignedBy: { $in: roleAgentIds } }
    ];
  }

  const leadOwnerMatch = {};
  if (targetAgentId) {
    leadOwnerMatch.currentOwner = targetAgentId;
  } else if (roleAgentIds !== null) {
    leadOwnerMatch.currentOwner = { $in: roleAgentIds };
  }

  // 1. Scheduled (Planned) walk-ins scheduled for this calendar date
  const walkInScheduledMatch = {
    status: 'Planned',
    walkInDate: { $gte: start, $lte: end },
    ...walkInAgentMatch
  };

  // 2. Completed walk-ins on this date (using actual visit completion timestamp)
  const completedDateOr = [
    { locationCapturedAt: { $gte: start, $lte: end } },
    { locationCapturedAt: null, walkInDate: { $gte: start, $lte: end } },
    { locationCapturedAt: { $exists: false }, walkInDate: { $gte: start, $lte: end } }
  ];
  const walkInCompletedMatch = {
    status: { $in: ['Done', 'Completed'] }
  };
  if (walkInAgentMatch.$or) {
    walkInCompletedMatch.$and = [
      { $or: completedDateOr },
      { $or: walkInAgentMatch.$or }
    ];
  } else {
    walkInCompletedMatch.$or = completedDateOr;
    Object.assign(walkInCompletedMatch, walkInAgentMatch);
  }

  // 3. Not Done walk-ins on this date (using actual status-change date)
  const notDoneDateOr = [
    { updatedAt: { $gte: start, $lte: end } },
    { updatedAt: null, walkInDate: { $gte: start, $lte: end } }
  ];
  const walkInNotDoneMatch = {
    status: 'Not Done'
  };
  if (walkInAgentMatch.$or) {
    walkInNotDoneMatch.$and = [
      { $or: notDoneDateOr },
      { $or: walkInAgentMatch.$or }
    ];
  } else {
    walkInNotDoneMatch.$or = notDoneDateOr;
    Object.assign(walkInNotDoneMatch, walkInAgentMatch);
  }

  const [callsInDay, demosInDay, scheduledWalkIns, completedWalkIns, notDoneWalkIns, wonLeads, lostLeads] = await Promise.all([
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
    Demo.find(demoMatch)
      .populate('salesAgent', 'fullName username')
      .populate('assignedBy', 'fullName username')
      .populate('lead', 'organizationName leadNumber')
      .lean(),
    WalkIn.find(walkInScheduledMatch)
      .populate('salesAgent', 'fullName username')
      .populate('assignedBy', 'fullName username')
      .populate('lead', 'organizationName leadNumber address hospitalCoordinates')
      .lean(),
    WalkIn.find(walkInCompletedMatch)
      .populate('salesAgent', 'fullName username')
      .populate('assignedBy', 'fullName username')
      .populate('lead', 'organizationName leadNumber address hospitalCoordinates')
      .lean(),
    WalkIn.find(walkInNotDoneMatch)
      .populate('salesAgent', 'fullName username')
      .populate('assignedBy', 'fullName username')
      .populate('lead', 'organizationName leadNumber address hospitalCoordinates')
      .lean(),
    Lead.find({
      closureStatus: 'WON',
      ...leadOwnerMatch,
      $or: [
        { closedAt: { $gte: start, $lte: end } },
        { closedAt: null, updatedAt: { $gte: start, $lte: end } },
        { closedAt: { $exists: false }, updatedAt: { $gte: start, $lte: end } }
      ]
    }).select('leadNumber organizationName dealValue product closedAt currentOwner').populate('currentOwner', 'fullName username').lean(),
    Lead.find({
      closureStatus: 'LOST',
      ...leadOwnerMatch,
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

  // Walk-ins Breakdown (mutually exclusive counts according to existing data model)
  const walkInsScheduled = scheduledWalkIns.length;
  const walkInsCompleted = completedWalkIns.length;
  const walkInsNotCompleted = notDoneWalkIns.length;

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
    walkIns: completedWalkIns.map(w => ({
      leadNumber: w.lead?.leadNumber || 'N/A',
      hospitalName: w.lead?.organizationName || 'N/A',
      hospitalAddress: w.lead?.address || 'N/A',
      agentName: w.salesAgent?.fullName || w.salesAgent?.username || 'N/A',
      scheduledBy: w.assignedBy?.fullName || w.assignedBy?.username || 'N/A',
      walkInDate: formatISTDateOnly(w.walkInDate),
      walkInTime: w.walkInTime || 'N/A',
      status: w.status || 'Completed',
      remarks: w.remark || 'N/A',
      locationStatus: w.locationStatus || 'Not recorded',
      latitude: w.latitude != null ? w.latitude : null,
      longitude: w.longitude != null ? w.longitude : null,
      accuracy: w.accuracy != null ? `${w.accuracy}m` : 'N/A',
      deviceInstallationId: w.deviceInstallationId || 'Not recorded',
      hospitalLatitude: w.hospitalLatitude != null ? w.hospitalLatitude : (w.lead?.hospitalCoordinates?.latitude != null ? w.lead.hospitalCoordinates.latitude : null),
      hospitalLongitude: w.hospitalLongitude != null ? w.hospitalLongitude : (w.lead?.hospitalCoordinates?.longitude != null ? w.lead.hospitalCoordinates.longitude : null),
      distanceMetres: w.distanceMetres != null ? `${w.distanceMetres}m` : 'N/A',
      geofenceStatus: w.geofenceStatus || 'Not Verified',
      geofenceReason: w.geofenceReason || 'N/A',
      locationCapturedAt: w.locationCapturedAt ? formatISTDateTime(w.locationCapturedAt) : 'Not recorded',
      mapUrl: (w.latitude != null && w.longitude != null)
        ? `https://www.google.com/maps?q=${w.latitude},${w.longitude}`
        : null
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
    const reportData = await fetchDailyActivityData(req.query.date, req.query);
    res.json(reportData);
  } catch (err) {
    next(err);
  }
};

exports.exportDailyActivityReport = async (req, res, next) => {
  try {
    const format = (req.query.format || 'xlsx').toLowerCase();
    const data = await fetchDailyActivityData(req.query.date, req.query);
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
        'Activity Type': 'Walk-in Visit',
        'Lead Number': w.leadNumber,
        'Hospital Name': w.hospitalName,
        'Registered Address': sanitizeExportCell(w.hospitalAddress || 'N/A'),
        'Assigned Agent': w.agentName,
        'Scheduled By': w.scheduledBy,
        'Scheduled Date': w.walkInDate,
        'Scheduled Time': w.walkInTime,
        'Status': w.status,
        'Remarks': w.remarks,
        'Location Status': sanitizeExportCell(w.locationStatus || 'Not recorded'),
        'GPS Coordinates': (w.latitude != null && w.longitude != null) ? `${w.latitude.toFixed(6)}, ${w.longitude.toFixed(6)}` : 'Not recorded',
        'GPS Accuracy': sanitizeExportCell(w.accuracy || 'N/A'),
        'Hospital Coordinates': (w.hospitalLatitude != null && w.hospitalLongitude != null) ? `${w.hospitalLatitude.toFixed(6)}, ${w.hospitalLongitude.toFixed(6)}` : 'Not recorded',
        'Calculated Distance': sanitizeExportCell(w.distanceMetres || 'N/A'),
        'Geofence Result': sanitizeExportCell(w.geofenceStatus || 'Not Verified'),
        'Device Installation ID': sanitizeExportCell(w.deviceInstallationId || 'Not recorded'),
        'Google Maps Link': w.mapUrl ? sanitizeExportCell(w.mapUrl) : 'N/A',
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

// -------------------------------------------------------------
// Demo & Walk-in Activity Hospital List with Filters (Single Date, Month, Custom Range)
// -------------------------------------------------------------

function getActivityISTBoundaries(query = {}) {
  const dateMode = (query.dateMode || query.filterType || '').toLowerCase();
  const dateParam = query.date;
  const monthParam = query.month;
  const startParam = query.startDate || query.start;
  const endParam = query.endDate || query.end;

  let start = null;
  let end = null;
  let startDateStr = '';
  let endDateStr = '';
  let rangeLabel = '';
  let mode = 'single';

  if (dateMode === 'month' || (monthParam && !dateParam && !startParam)) {
    mode = 'month';
    let y, m;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam.trim())) {
      [y, m] = monthParam.trim().split('-').map(Number);
    } else {
      const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const [ny, nm] = nowStr.split('-').map(Number);
      y = ny;
      m = nm;
    }
    // Month starts on 1st at 00:00:00.000 IST
    start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0) - IST_OFFSET_MS);
    // Last day of month
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    // Month ends on lastDay at 23:59:59.999 IST
    end = new Date(Date.UTC(y, m - 1, lastDay, 23, 59, 59, 999) - IST_OFFSET_MS);

    startDateStr = `${y}-${String(m).padStart(2, '0')}-01`;
    endDateStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const dummyDate = new Date(Date.UTC(y, m - 1, 1));
    const monthName = dummyDate.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' });
    rangeLabel = `${monthName} ${y}`;
  } else if (dateMode === 'custom' || (startParam && endParam)) {
    mode = 'custom';
    let sY, sM, sD, eY, eM, eD;
    const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    if (startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam.trim())) {
      [sY, sM, sD] = startParam.trim().split('-').map(Number);
    } else {
      [sY, sM, sD] = nowStr.split('-').map(Number);
    }

    if (endParam && /^\d{4}-\d{2}-\d{2}$/.test(endParam.trim())) {
      [eY, eM, eD] = endParam.trim().split('-').map(Number);
    } else {
      [eY, eM, eD] = nowStr.split('-').map(Number);
    }

    // Ensure start <= end
    let startTime = Date.UTC(sY, sM - 1, sD);
    let endTime = Date.UTC(eY, eM - 1, eD);
    if (startTime > endTime) {
      [sY, sM, sD, eY, eM, eD] = [eY, eM, eD, sY, sM, sD];
    }

    start = new Date(Date.UTC(sY, sM - 1, sD, 0, 0, 0, 0) - IST_OFFSET_MS);
    end = new Date(Date.UTC(eY, eM - 1, eD, 23, 59, 59, 999) - IST_OFFSET_MS);
    startDateStr = `${sY}-${String(sM).padStart(2, '0')}-${String(sD).padStart(2, '0')}`;
    endDateStr = `${eY}-${String(eM).padStart(2, '0')}-${String(eD).padStart(2, '0')}`;
    rangeLabel = `${formatISTDateOnly(start)} to ${formatISTDateOnly(end)}`;
  } else {
    // Default: Single date
    mode = 'single';
    let y, m, d;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam.trim())) {
      [y, m, d] = dateParam.trim().split('-').map(Number);
    } else {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      [y, m, d] = todayStr.split('-').map(Number);
    }
    start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MS);
    end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - IST_OFFSET_MS);
    startDateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    endDateStr = startDateStr;
    rangeLabel = formatISTDateOnly(start);
  }

  return { mode, start, end, startDateStr, endDateStr, rangeLabel };
}

async function fetchActivityHospitalsData(queryParams = {}) {
  const { mode, start, end, startDateStr, endDateStr, rangeLabel } = getActivityISTBoundaries(queryParams);

  const agentFilter = queryParams.agentId || queryParams.agent || queryParams.owner;
  const roleFilter = queryParams.role || queryParams.agentRole;
  const activityType = (queryParams.activityType || 'ALL').toUpperCase(); // 'ALL', 'DEMO', 'WALKIN'
  const statusParam = (queryParams.status || 'ALL').trim();
  const search = (queryParams.search || '').trim().toLowerCase();
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.max(1, Math.min(200, parseInt(queryParams.limit, 10) || 20));

  let targetAgentId = null;
  let roleAgentIds = null;

  if (roleFilter && roleFilter !== 'all') {
    const matchingUsers = await User.find({
      role: 'AGENT',
      agentRole: new RegExp(`^${roleFilter.trim()}$`, 'i'),
    }).select('_id').lean();
    roleAgentIds = matchingUsers.map(u => u._id);
  }

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
  }

  // Agent match query
  const agentMatch = {};
  if (targetAgentId) {
    agentMatch.$or = [
      { salesAgent: targetAgentId },
      { salesAgent: null, assignedBy: targetAgentId },
      { salesAgent: { $exists: false }, assignedBy: targetAgentId },
    ];
  } else if (roleAgentIds !== null) {
    agentMatch.$or = [
      { salesAgent: { $in: roleAgentIds } },
      { salesAgent: null, assignedBy: { $in: roleAgentIds } },
      { salesAgent: { $exists: false }, assignedBy: { $in: roleAgentIds } },
    ];
  }

  // Normalize status filter
  let normalizedStatus = 'ALL';
  if (/^schedul(ed)?|planned$/i.test(statusParam)) {
    normalizedStatus = 'SCHEDULED';
  } else if (/^complet(ed)?|done$/i.test(statusParam)) {
    normalizedStatus = 'COMPLETED';
  } else if (/^not[\s_-]?done|cancel(led)?$/i.test(statusParam)) {
    normalizedStatus = 'NOT_DONE';
  }

  // 1. KPI Counts queries (across the entire selected date range & agent, independent of pagination or status selection)
  const demoDateFilter = { demoDate: { $gte: start, $lte: end } };
  const baseDemoQuery = agentMatch.$or ? { $and: [demoDateFilter, agentMatch] } : demoDateFilter;

  const [
    demosScheduledCount,
    demosCompletedCount,
    demosNotDoneCount,
    scheduledWalkInsCount,
    completedWalkInsCount,
    notDoneWalkInsCount
  ] = await Promise.all([
    Demo.countDocuments({ ...baseDemoQuery, status: 'Planned' }),
    Demo.countDocuments({ ...baseDemoQuery, status: { $in: ['Done', 'Completed'] } }),
    Demo.countDocuments({ ...baseDemoQuery, status: { $in: ['Not Done', 'Cancelled'] } }),
    // WalkIn Planned (using scheduled walkInDate in range)
    WalkIn.countDocuments(agentMatch.$or ? {
      $and: [
        { status: 'Planned', walkInDate: { $gte: start, $lte: end } },
        agentMatch
      ]
    } : { status: 'Planned', walkInDate: { $gte: start, $lte: end } }),
    // WalkIn Completed (using locationCapturedAt or fallback to walkInDate in range)
    WalkIn.countDocuments(agentMatch.$or ? {
      $and: [
        {
          status: { $in: ['Done', 'Completed'] },
          $or: [
            { locationCapturedAt: { $gte: start, $lte: end } },
            { locationCapturedAt: null, walkInDate: { $gte: start, $lte: end } },
            { locationCapturedAt: { $exists: false }, walkInDate: { $gte: start, $lte: end } }
          ]
        },
        agentMatch
      ]
    } : {
      status: { $in: ['Done', 'Completed'] },
      $or: [
        { locationCapturedAt: { $gte: start, $lte: end } },
        { locationCapturedAt: null, walkInDate: { $gte: start, $lte: end } },
        { locationCapturedAt: { $exists: false }, walkInDate: { $gte: start, $lte: end } }
      ]
    }),
    // WalkIn Not Done (using updatedAt or fallback to walkInDate in range)
    WalkIn.countDocuments(agentMatch.$or ? {
      $and: [
        {
          status: { $in: ['Not Done', 'Cancelled'] },
          $or: [
            { updatedAt: { $gte: start, $lte: end } },
            { updatedAt: null, walkInDate: { $gte: start, $lte: end } },
            { updatedAt: { $exists: false }, walkInDate: { $gte: start, $lte: end } }
          ]
        },
        agentMatch
      ]
    } : {
      status: { $in: ['Not Done', 'Cancelled'] },
      $or: [
        { updatedAt: { $gte: start, $lte: end } },
        { updatedAt: null, walkInDate: { $gte: start, $lte: end } },
        { updatedAt: { $exists: false }, walkInDate: { $gte: start, $lte: end } }
      ]
    })
  ]);

  const demosTotalCount = demosScheduledCount + demosCompletedCount + demosNotDoneCount;
  const walkInsTotalCount = scheduledWalkInsCount + completedWalkInsCount + notDoneWalkInsCount;

  // 2. Fetch specific items matching activityType and status filters
  let demoDocs = [];
  let walkInDocs = [];

  const shouldFetchDemos = activityType === 'ALL' || activityType === 'DEMO';
  const shouldFetchWalkIns = activityType === 'ALL' || activityType === 'WALKIN';

  const fetchPromises = [];

  if (shouldFetchDemos) {
    let demoStatusFilter = {};
    if (normalizedStatus === 'SCHEDULED') {
      demoStatusFilter = { status: 'Planned' };
    } else if (normalizedStatus === 'COMPLETED') {
      demoStatusFilter = { status: { $in: ['Done', 'Completed'] } };
    } else if (normalizedStatus === 'NOT_DONE') {
      demoStatusFilter = { status: { $in: ['Not Done', 'Cancelled'] } };
    }

    const demoQuery = {
      demoDate: { $gte: start, $lte: end },
      ...demoStatusFilter
    };
    const finalDemoQuery = agentMatch.$or ? { $and: [demoQuery, agentMatch] } : demoQuery;

    fetchPromises.push(
      Demo.find(finalDemoQuery)
        .populate({
          path: 'lead',
          select: 'organizationName leadNumber address closureStatus primaryContact hospitalCoordinates',
          populate: { path: 'primaryContact', select: 'name phone altPhone' }
        })
        .populate('salesAgent', 'fullName username agentRole')
        .populate('assignedBy', 'fullName username')
        .sort({ demoDate: -1, createdAt: -1 })
        .lean()
        .then(docs => { demoDocs = docs; })
    );
  }

  if (shouldFetchWalkIns) {
    let walkInStatusAndDate = {};
    if (normalizedStatus === 'SCHEDULED') {
      walkInStatusAndDate = {
        status: 'Planned',
        walkInDate: { $gte: start, $lte: end }
      };
    } else if (normalizedStatus === 'COMPLETED') {
      walkInStatusAndDate = {
        status: { $in: ['Done', 'Completed'] },
        $or: [
          { locationCapturedAt: { $gte: start, $lte: end } },
          { locationCapturedAt: null, walkInDate: { $gte: start, $lte: end } },
          { locationCapturedAt: { $exists: false }, walkInDate: { $gte: start, $lte: end } }
        ]
      };
    } else if (normalizedStatus === 'NOT_DONE') {
      walkInStatusAndDate = {
        status: { $in: ['Not Done', 'Cancelled'] },
        $or: [
          { updatedAt: { $gte: start, $lte: end } },
          { updatedAt: null, walkInDate: { $gte: start, $lte: end } },
          { updatedAt: { $exists: false }, walkInDate: { $gte: start, $lte: end } }
        ]
      };
    } else {
      // ALL statuses
      walkInStatusAndDate = {
        $or: [
          { status: 'Planned', walkInDate: { $gte: start, $lte: end } },
          {
            status: { $in: ['Done', 'Completed'] },
            $or: [
              { locationCapturedAt: { $gte: start, $lte: end } },
              { locationCapturedAt: null, walkInDate: { $gte: start, $lte: end } },
              { locationCapturedAt: { $exists: false }, walkInDate: { $gte: start, $lte: end } }
            ]
          },
          {
            status: { $in: ['Not Done', 'Cancelled'] },
            $or: [
              { updatedAt: { $gte: start, $lte: end } },
              { updatedAt: null, walkInDate: { $gte: start, $lte: end } },
              { updatedAt: { $exists: false }, walkInDate: { $gte: start, $lte: end } }
            ]
          }
        ]
      };
    }

    const finalWalkInQuery = agentMatch.$or
      ? { $and: [walkInStatusAndDate, agentMatch] }
      : walkInStatusAndDate;

    fetchPromises.push(
      WalkIn.find(finalWalkInQuery)
        .populate({
          path: 'lead',
          select: 'organizationName leadNumber address closureStatus primaryContact hospitalCoordinates',
          populate: { path: 'primaryContact', select: 'name phone altPhone' }
        })
        .populate('salesAgent', 'fullName username agentRole')
        .populate('assignedBy', 'fullName username')
        .sort({ walkInDate: -1, createdAt: -1 })
        .lean()
        .then(docs => { walkInDocs = docs; })
    );
  }

  await Promise.all(fetchPromises);

  // 3. Map into unified activity list
  const formattedActivities = [];

  demoDocs.forEach(d => {
    let statusLabel = 'Scheduled';
    if (['Done', 'Completed'].includes(d.status)) {
      statusLabel = 'Completed';
    } else if (['Not Done', 'Cancelled'].includes(d.status)) {
      statusLabel = 'Not Done';
    }

    const leadObj = d.lead || {};
    formattedActivities.push({
      id: d._id.toString(),
      activityType: 'Demo',
      leadId: leadObj._id ? leadObj._id.toString() : '',
      leadNumber: leadObj.leadNumber || 'N/A',
      hospitalName: leadObj.organizationName || 'N/A',
      hospitalAddress: leadObj.address || 'N/A',
      contactPhone: leadObj.primaryContact?.phone || 'N/A',
      contactName: leadObj.primaryContact?.name || 'N/A',
      activityDate: d.demoDate,
      activityDateFormatted: formatISTDateOnly(d.demoDate),
      activityTime: d.demoTime || 'N/A',
      status: statusLabel,
      rawStatus: d.status || 'Planned',
      assignedAgent: {
        id: d.salesAgent?._id ? d.salesAgent._id.toString() : null,
        name: d.salesAgent?.fullName || d.salesAgent?.username || 'Unassigned',
        role: d.salesAgent?.agentRole || 'Sales Agent'
      },
      assignedBy: {
        id: d.assignedBy?._id ? d.assignedBy._id.toString() : null,
        name: d.assignedBy?.fullName || d.assignedBy?.username || 'N/A'
      },
      remarks: d.remarks || 'No remarks recorded',
      locationStatus: 'N/A',
      latitude: null,
      longitude: null,
      accuracy: null,
      distanceMetres: null,
      geofenceStatus: 'N/A',
      deviceInstallationId: null,
      mapUrl: null,
      createdAt: d.createdAt
    });
  });

  walkInDocs.forEach(w => {
    let statusLabel = 'Scheduled';
    if (['Done', 'Completed'].includes(w.status)) {
      statusLabel = 'Completed';
    } else if (['Not Done', 'Cancelled'].includes(w.status)) {
      statusLabel = 'Not Done';
    }

    const leadObj = w.lead || {};
    const effectiveVisitDate = (['Done', 'Completed'].includes(w.status) && w.locationCapturedAt)
      ? w.locationCapturedAt
      : w.walkInDate;

    formattedActivities.push({
      id: w._id.toString(),
      activityType: 'Walk-in',
      leadId: leadObj._id ? leadObj._id.toString() : '',
      leadNumber: leadObj.leadNumber || 'N/A',
      hospitalName: leadObj.organizationName || 'N/A',
      hospitalAddress: leadObj.address || 'N/A',
      contactPhone: leadObj.primaryContact?.phone || 'N/A',
      contactName: leadObj.primaryContact?.name || 'N/A',
      activityDate: effectiveVisitDate,
      activityDateFormatted: formatISTDateOnly(effectiveVisitDate),
      activityTime: w.walkInTime || 'N/A',
      status: statusLabel,
      rawStatus: w.status || 'Planned',
      assignedAgent: {
        id: w.salesAgent?._id ? w.salesAgent._id.toString() : null,
        name: w.salesAgent?.fullName || w.salesAgent?.username || 'Unassigned',
        role: w.salesAgent?.agentRole || 'Sales Agent'
      },
      assignedBy: {
        id: w.assignedBy?._id ? w.assignedBy._id.toString() : null,
        name: w.assignedBy?.fullName || w.assignedBy?.username || 'N/A'
      },
      remarks: w.remark || w.remarks || 'No visit remarks recorded',
      locationStatus: w.locationStatus || 'Not Requested',
      latitude: w.latitude != null ? w.latitude : null,
      longitude: w.longitude != null ? w.longitude : null,
      accuracy: w.accuracy != null ? `${w.accuracy}m` : null,
      distanceMetres: w.distanceMetres != null ? `${w.distanceMetres}m` : null,
      geofenceStatus: w.geofenceStatus || 'Not Verified',
      deviceInstallationId: w.deviceInstallationId || null,
      mapUrl: (w.latitude != null && w.longitude != null)
        ? `https://www.google.com/maps?q=${w.latitude},${w.longitude}`
        : null,
      createdAt: w.createdAt
    });
  });

  // Sort newest activity first
  formattedActivities.sort((a, b) => {
    const timeA = a.activityDate ? new Date(a.activityDate).getTime() : 0;
    const timeB = b.activityDate ? new Date(b.activityDate).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return createdB - createdA;
  });

  // 4. Apply text search if present
  let filteredActivities = formattedActivities;
  if (search) {
    filteredActivities = formattedActivities.filter(item => {
      return (
        item.hospitalName.toLowerCase().includes(search) ||
        item.leadNumber.toLowerCase().includes(search) ||
        item.remarks.toLowerCase().includes(search) ||
        item.assignedAgent.name.toLowerCase().includes(search) ||
        item.assignedBy.name.toLowerCase().includes(search) ||
        item.status.toLowerCase().includes(search) ||
        item.activityType.toLowerCase().includes(search)
      );
    });
  }

  // 5. Unique Hospitals Count across the matching activities
  const uniqueHospitalIds = new Set(
    filteredActivities.map(a => a.leadId).filter(Boolean)
  );

  // Pagination
  const totalRecords = filteredActivities.length;
  const totalPages = Math.ceil(totalRecords / limit) || 1;
  const startIndex = (page - 1) * limit;
  const pagedActivities = filteredActivities.slice(startIndex, startIndex + limit);

  // Filtered status counts matching current filter selection:
  const filteredScheduledCount = filteredActivities.filter(a => a.status === 'Scheduled').length;
  const filteredCompletedCount = filteredActivities.filter(a => a.status === 'Completed').length;
  const filteredNotDoneCount = filteredActivities.filter(a => a.status === 'Not Done').length;
  const filteredDemosCount = filteredActivities.filter(a => a.activityType === 'Demo').length;
  const filteredWalkInsCount = filteredActivities.filter(a => a.activityType === 'Walk-in').length;

  return {
    filter: {
      dateMode: mode,
      startDate: startDateStr,
      endDate: endDateStr,
      rangeLabel,
      activityType,
      status: statusParam,
      agentId: agentFilter || '',
      role: roleFilter || '',
      search
    },
    summary: {
      totalActivities: totalRecords,
      uniqueHospitals: uniqueHospitalIds.size,
      demosCount: filteredDemosCount,
      walkInsCount: filteredWalkInsCount,
      scheduledCount: filteredScheduledCount,
      completedCount: filteredCompletedCount,
      notDoneCount: filteredNotDoneCount,
      periodTotals: {
        demosTotal: demosTotalCount,
        demosScheduled: demosScheduledCount,
        demosCompleted: demosCompletedCount,
        demosNotDone: demosNotDoneCount,
        walkInsTotal: walkInsTotalCount,
        walkInsScheduled: scheduledWalkInsCount,
        walkInsCompleted: completedWalkInsCount,
        walkInsNotCompleted: notDoneWalkInsCount,
      }
    },
    pagination: {
      page,
      limit,
      totalPages,
      totalRecords
    },
    activities: pagedActivities,
    allFilteredActivities: filteredActivities
  };
}

exports.activityHospitals = async (req, res, next) => {
  try {
    const query = { ...req.query };
    if (req.user && req.user.role === 'AGENT') {
      query.agentId = req.user._id.toString();
    }
    const data = await fetchActivityHospitalsData(query);
    const { allFilteredActivities, ...result } = data;
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.exportActivityHospitals = async (req, res, next) => {
  try {
    const format = (req.query.format || 'xlsx').toLowerCase();
    const query = { ...req.query, page: 1, limit: 10000 };
    if (req.user && req.user.role === 'AGENT') {
      query.agentId = req.user._id.toString();
    }
    const data = await fetchActivityHospitalsData(query);
    const { filter, summary, allFilteredActivities } = data;

    if (format === 'csv') {
      const headers = [
        'Activity Type',
        'Hospital / Organization Name',
        'Lead ID / Number',
        'Activity Date (IST)',
        'Activity Time',
        'Status',
        'Assigned Agent',
        'Scheduled By',
        'Hospital Address',
        'Contact Phone',
        'Activity Remarks',
        'GPS Location Status',
        'GPS Accuracy',
        'Geofence Status',
        'Google Map Link'
      ];
      const rows = allFilteredActivities.map(a => [
        sanitizeExportCell(a.activityType),
        sanitizeExportCell(a.hospitalName),
        sanitizeExportCell(a.leadNumber),
        sanitizeExportCell(a.activityDateFormatted),
        sanitizeExportCell(a.activityTime),
        sanitizeExportCell(a.status),
        sanitizeExportCell(a.assignedAgent.name),
        sanitizeExportCell(a.assignedBy.name),
        sanitizeExportCell(a.hospitalAddress),
        sanitizeExportCell(a.contactPhone),
        sanitizeExportCell(a.remarks),
        sanitizeExportCell(a.locationStatus),
        sanitizeExportCell(a.accuracy || ''),
        sanitizeExportCell(a.geofenceStatus || ''),
        sanitizeExportCell(a.mapUrl || '')
      ]);
      const csvContent = '\uFEFF' + [
        headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
        ...rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      ].join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="hospital_activities_${filter.startDate}_to_${filter.endDate}.csv"`);
      return res.status(200).send(csvContent);
    }

    // Default: Multi-sheet Excel
    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const summarySheetRows = [
      { Metric: 'Period', Value: filter.rangeLabel },
      { Metric: 'Date Mode', Value: filter.dateMode.toUpperCase() },
      { Metric: 'Activity Type Filter', Value: filter.activityType },
      { Metric: 'Status Filter', Value: filter.status },
      { Metric: 'Total Activities', Value: summary.totalActivities },
      { Metric: 'Unique Hospitals', Value: summary.uniqueHospitals },
      { Metric: 'Demos in Selection', Value: summary.demosCount },
      { Metric: 'Walk-ins in Selection', Value: summary.walkInsCount },
      { Metric: 'Scheduled Activities', Value: summary.scheduledCount },
      { Metric: 'Completed Activities', Value: summary.completedCount },
      { Metric: 'Not Done Activities', Value: summary.notDoneCount },
      { Metric: 'Exported At (IST)', Value: formatISTDateTime(new Date()) },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summarySheetRows);
    wsSummary['!cols'] = [{ wch: 28 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // Activities Sheet
    const activityRows = allFilteredActivities.map(a => ({
      'Activity Type': sanitizeExportCell(a.activityType),
      'Hospital Name': sanitizeExportCell(a.hospitalName),
      'Lead Number': sanitizeExportCell(a.leadNumber),
      'Activity Date (IST)': sanitizeExportCell(a.activityDateFormatted),
      'Activity Time': sanitizeExportCell(a.activityTime),
      'Status': sanitizeExportCell(a.status),
      'Assigned Agent': sanitizeExportCell(a.assignedAgent.name),
      'Scheduled By': sanitizeExportCell(a.assignedBy.name),
      'Hospital Address': sanitizeExportCell(a.hospitalAddress),
      'Contact Phone': sanitizeExportCell(a.contactPhone),
      'Activity Remarks': sanitizeExportCell(a.remarks),
      'GPS Status': sanitizeExportCell(a.locationStatus),
      'Accuracy': sanitizeExportCell(a.accuracy || ''),
      'Geofence': sanitizeExportCell(a.geofenceStatus || ''),
      'Map Link': sanitizeExportCell(a.mapUrl || ''),
    }));
    const wsActivities = XLSX.utils.json_to_sheet(activityRows.length ? activityRows : [{ Note: 'No activities found matching criteria' }]);
    wsActivities['!cols'] = [
      { wch: 14 },
      { wch: 30 },
      { wch: 14 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 22 },
      { wch: 20 },
      { wch: 30 },
      { wch: 18 },
      { wch: 35 },
      { wch: 15 },
      { wch: 12 },
      { wch: 14 },
      { wch: 35 },
    ];
    XLSX.utils.book_append_sheet(wb, wsActivities, 'Hospital Activities');

    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="hospital_activities_${filter.startDate}_to_${filter.endDate}.xlsx"`);
    res.setHeader('Content-Length', excelBuffer.length);
    return res.status(200).send(excelBuffer);
  } catch (err) {
    next(err);
  }
};

// -------------------------------------------------------------
// Dashboard Metric Specific Records (Clickable Metric Cards)
// -------------------------------------------------------------

async function fetchDashboardMetricRecords(queryParams = {}) {
  const metric = (queryParams.metric || 'demos').trim();
  const { start, end } = parseDateRange(queryParams);
  const agentFilter = queryParams.agentId || queryParams.owner || queryParams.agent;
  const roleFilter = queryParams.role || queryParams.agentRole;
  const search = (queryParams.search || '').trim().toLowerCase();
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.max(1, Math.min(200, parseInt(queryParams.limit, 10) || 20));

  let targetAgentId = null;
  let targetAgent = null;

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
      }).select('_id fullName username agentRole');
      if (found) {
        targetAgentId = found._id;
        targetAgent = found;
      }
    }
    if (targetAgentId && !targetAgent) {
      targetAgent = await User.findById(targetAgentId).select('fullName username agentRole').lean();
    }
  }

  // Lead match: currentOwner or createdBy
  const agentLeadMatch = targetAgentId ? { $or: [{ currentOwner: targetAgentId }, { createdBy: targetAgentId }] } : {};

  let agentLeadIds = [];
  if (targetAgentId) {
    const leads = await Lead.find(agentLeadMatch).select('_id').lean();
    agentLeadIds = leads.map(l => l._id);
  }

  // Activity match: salesAgent or assignedBy or lead owned/created by agent
  const activityAgentMatch = targetAgentId ? {
    $or: [
      { salesAgent: targetAgentId },
      { assignedBy: targetAgentId },
      ...(agentLeadIds.length ? [{ lead: { $in: agentLeadIds } }] : [])
    ]
  } : {};

  const now = new Date();
  let metricLabel = 'Activity Records';
  let rawItems = [];

  switch (metric) {
    case 'newLeads': {
      metricLabel = 'New Leads';
      const newLeadsMatch = { ...agentLeadMatch };
      if (start || end) {
        newLeadsMatch.createdAt = {};
        if (start) newLeadsMatch.createdAt.$gte = start;
        if (end) newLeadsMatch.createdAt.$lte = end;
      }
      const leads = await Lead.find(newLeadsMatch)
        .populate('currentOwner', 'fullName username agentRole')
        .populate('createdBy', 'fullName username agentRole')
        .populate('primaryContact', 'name phone')
        .sort({ createdAt: -1, _id: -1 })
        .lean();

      rawItems = leads.map(l => ({
        id: l._id.toString(),
        leadId: l._id.toString(),
        leadNumber: l.leadNumber || 'N/A',
        hospitalName: l.organizationName || 'N/A',
        hospitalAddress: l.address || 'N/A',
        contactPhone: l.primaryContact?.phone || 'N/A',
        contactName: l.primaryContact?.name || 'N/A',
        date: l.createdAt,
        dateFormatted: formatISTDateTime(l.createdAt),
        time: '',
        status: l.closureStatus || l.status || 'OPEN',
        assignedAgent: l.currentOwner?.fullName || l.currentOwner?.username || 'Unassigned',
        assignedRole: l.currentOwner?.agentRole || 'Sales Agent',
        scheduledBy: l.createdBy?.fullName || l.createdBy?.username || 'N/A',
        remarks: l.remarks || l.sourceRemarks || 'New lead created',
        extra: { leadSource: l.leadSource || 'N/A' },
        createdAt: l.createdAt
      }));
      break;
    }

    case 'calls': {
      metricLabel = 'Calls';
      const callMatch = {};
      if (targetAgentId) {
        callMatch.$or = [
          { user: targetAgentId },
          { calledBy: targetAgentId },
          ...(agentLeadIds.length ? [{ lead: { $in: agentLeadIds } }] : [])
        ];
      }
      if (start || end) {
        callMatch.calledAt = {};
        if (start) callMatch.calledAt.$gte = start;
        if (end) callMatch.calledAt.$lte = end;
      }
      const calls = await CallLog.find(callMatch)
        .populate({
          path: 'lead',
          select: 'organizationName leadNumber address closureStatus currentOwner primaryContact',
          populate: { path: 'primaryContact', select: 'name phone' }
        })
        .populate('user', 'fullName username agentRole')
        .populate('calledContact', 'name phone')
        .sort({ calledAt: -1, createdAt: -1 })
        .lean();

      rawItems = calls.map(c => {
        const leadObj = c.lead || {};
        const callTime = c.calledAt || c.createdAt;
        const phone = c.calledContact?.phone || leadObj.primaryContact?.phone || 'N/A';
        const contactName = c.calledContact?.name || leadObj.primaryContact?.name || 'N/A';
        const callerName = c.user?.fullName || c.user?.username || 'Unassigned';
        const disposition = c.disposition || 'Call';
        return {
          id: c._id.toString(),
          leadId: leadObj._id ? leadObj._id.toString() : '',
          leadNumber: leadObj.leadNumber || 'N/A',
          hospitalName: leadObj.organizationName || 'N/A',
          hospitalAddress: leadObj.address || 'N/A',
          contactPhone: phone,
          contactName: contactName,
          date: callTime,
          dateFormatted: formatISTDateTime(callTime),
          time: '',
          status: leadObj.closureStatus || 'OPEN',
          leadStatus: leadObj.closureStatus || 'OPEN',
          assignedAgent: callerName,
          callerName: callerName,
          assignedRole: c.user?.agentRole || 'Calling Agent',
          scheduledBy: disposition,
          disposition: disposition,
          remarks: c.remark || 'No call remarks',
          extra: {
            disposition,
            callerName,
            contactPhone: phone,
            contactName,
            leadStatus: leadObj.closureStatus || 'OPEN'
          },
          createdAt: c.createdAt
        };
      });
      break;
    }

    case 'demos': {
      metricLabel = 'Demos';
      const demoDateMatch = {};
      if (start || end) {
        demoDateMatch.demoDate = {};
        if (start) demoDateMatch.demoDate.$gte = start;
        if (end) demoDateMatch.demoDate.$lte = end;
      }
      const demoFilter = { ...activityAgentMatch, ...demoDateMatch };
      const demos = await Demo.find(demoFilter)
        .populate({
          path: 'lead',
          select: 'organizationName leadNumber address closureStatus primaryContact',
          populate: { path: 'primaryContact', select: 'name phone' }
        })
        .populate('salesAgent', 'fullName username agentRole')
        .populate('assignedBy', 'fullName username')
        .sort({ demoDate: -1, createdAt: -1 })
        .lean();

      rawItems = demos.map(d => {
        const leadObj = d.lead || {};
        return {
          id: d._id.toString(),
          leadId: leadObj._id ? leadObj._id.toString() : '',
          leadNumber: leadObj.leadNumber || 'N/A',
          hospitalName: leadObj.organizationName || 'N/A',
          hospitalAddress: leadObj.address || 'N/A',
          contactPhone: leadObj.primaryContact?.phone || 'N/A',
          contactName: leadObj.primaryContact?.name || 'N/A',
          date: d.demoDate,
          dateFormatted: formatISTDateOnly(d.demoDate),
          time: d.demoTime || 'N/A',
          status: d.status === 'Planned' ? 'Scheduled' : d.status,
          assignedAgent: d.salesAgent?.fullName || d.salesAgent?.username || 'Unassigned',
          assignedRole: d.salesAgent?.agentRole || 'Sales Agent',
          scheduledBy: d.assignedBy?.fullName || d.assignedBy?.username || 'N/A',
          remarks: d.remarks || 'No remarks recorded',
          extra: {},
          createdAt: d.createdAt
        };
      });
      break;
    }

    case 'demosCompleted': {
      metricLabel = 'Demos Completed';
      const demoDateMatch = {};
      if (start || end) {
        demoDateMatch.demoDate = {};
        if (start) demoDateMatch.demoDate.$gte = start;
        if (end) demoDateMatch.demoDate.$lte = end;
      }
      const demoFilter = {
        ...activityAgentMatch,
        ...demoDateMatch,
        status: { $in: ['Done', 'Completed'] }
      };
      const demos = await Demo.find(demoFilter)
        .populate({
          path: 'lead',
          select: 'organizationName leadNumber address closureStatus primaryContact',
          populate: { path: 'primaryContact', select: 'name phone' }
        })
        .populate('salesAgent', 'fullName username agentRole')
        .populate('assignedBy', 'fullName username')
        .sort({ demoDate: -1, createdAt: -1 })
        .lean();

      rawItems = demos.map(d => {
        const leadObj = d.lead || {};
        return {
          id: d._id.toString(),
          leadId: leadObj._id ? leadObj._id.toString() : '',
          leadNumber: leadObj.leadNumber || 'N/A',
          hospitalName: leadObj.organizationName || 'N/A',
          hospitalAddress: leadObj.address || 'N/A',
          contactPhone: leadObj.primaryContact?.phone || 'N/A',
          contactName: leadObj.primaryContact?.name || 'N/A',
          date: d.demoDate,
          dateFormatted: formatISTDateOnly(d.demoDate),
          time: d.demoTime || 'N/A',
          status: 'Completed',
          assignedAgent: d.salesAgent?.fullName || d.salesAgent?.username || 'Unassigned',
          assignedRole: d.salesAgent?.agentRole || 'Sales Agent',
          scheduledBy: d.assignedBy?.fullName || d.assignedBy?.username || 'N/A',
          remarks: d.remarks || 'Demo completed',
          extra: {},
          createdAt: d.createdAt
        };
      });
      break;
    }

    case 'walkins': {
      metricLabel = 'Walk-ins';
      const walkInDateMatch = {};
      if (start || end) {
        walkInDateMatch.walkInDate = {};
        if (start) walkInDateMatch.walkInDate.$gte = start;
        if (end) walkInDateMatch.walkInDate.$lte = end;
      }
      const walkInFilter = { ...activityAgentMatch, ...walkInDateMatch };
      const walkIns = await WalkIn.find(walkInFilter)
        .populate({
          path: 'lead',
          select: 'organizationName leadNumber address closureStatus primaryContact hospitalCoordinates',
          populate: { path: 'primaryContact', select: 'name phone' }
        })
        .populate('salesAgent', 'fullName username agentRole')
        .populate('assignedBy', 'fullName username')
        .sort({ walkInDate: -1, createdAt: -1 })
        .lean();

      rawItems = walkIns.map(w => {
        const leadObj = w.lead || {};
        return {
          id: w._id.toString(),
          leadId: leadObj._id ? leadObj._id.toString() : '',
          leadNumber: leadObj.leadNumber || 'N/A',
          hospitalName: leadObj.organizationName || 'N/A',
          hospitalAddress: leadObj.address || 'N/A',
          contactPhone: leadObj.primaryContact?.phone || 'N/A',
          contactName: leadObj.primaryContact?.name || 'N/A',
          date: w.walkInDate,
          dateFormatted: formatISTDateOnly(w.walkInDate),
          time: w.walkInTime || 'N/A',
          status: w.status === 'Planned' ? 'Scheduled' : w.status,
          assignedAgent: w.salesAgent?.fullName || w.salesAgent?.username || 'Unassigned',
          assignedRole: w.salesAgent?.agentRole || 'Sales Agent',
          scheduledBy: w.assignedBy?.fullName || w.assignedBy?.username || 'N/A',
          remarks: w.remark || w.remarks || 'No visit remarks',
          extra: {
            locationStatus: w.locationStatus,
            mapUrl: (w.latitude != null && w.longitude != null) ? `https://www.google.com/maps?q=${w.latitude},${w.longitude}` : null
          },
          createdAt: w.createdAt
        };
      });
      break;
    }

    case 'walkinsCompleted': {
      metricLabel = 'Walk-ins Completed';
      const walkInDateMatch = {};
      if (start || end) {
        walkInDateMatch.walkInDate = {};
        if (start) walkInDateMatch.walkInDate.$gte = start;
        if (end) walkInDateMatch.walkInDate.$lte = end;
      }
      const walkInFilter = {
        ...activityAgentMatch,
        ...walkInDateMatch,
        status: { $in: ['Done', 'Completed'] }
      };
      const walkIns = await WalkIn.find(walkInFilter)
        .populate({
          path: 'lead',
          select: 'organizationName leadNumber address closureStatus primaryContact hospitalCoordinates',
          populate: { path: 'primaryContact', select: 'name phone' }
        })
        .populate('salesAgent', 'fullName username agentRole')
        .populate('assignedBy', 'fullName username')
        .sort({ walkInDate: -1, createdAt: -1 })
        .lean();

      rawItems = walkIns.map(w => {
        const leadObj = w.lead || {};
        const effectiveDate = w.locationCapturedAt || w.walkInDate;
        return {
          id: w._id.toString(),
          leadId: leadObj._id ? leadObj._id.toString() : '',
          leadNumber: leadObj.leadNumber || 'N/A',
          hospitalName: leadObj.organizationName || 'N/A',
          hospitalAddress: leadObj.address || 'N/A',
          contactPhone: leadObj.primaryContact?.phone || 'N/A',
          contactName: leadObj.primaryContact?.name || 'N/A',
          date: effectiveDate,
          dateFormatted: formatISTDateOnly(effectiveDate),
          time: w.walkInTime || 'N/A',
          status: 'Completed',
          assignedAgent: w.salesAgent?.fullName || w.salesAgent?.username || 'Unassigned',
          assignedRole: w.salesAgent?.agentRole || 'Sales Agent',
          scheduledBy: w.assignedBy?.fullName || w.assignedBy?.username || 'N/A',
          remarks: w.remark || w.remarks || 'Walk-in visit completed',
          extra: {
            locationStatus: w.locationStatus,
            mapUrl: (w.latitude != null && w.longitude != null) ? `https://www.google.com/maps?q=${w.latitude},${w.longitude}` : null
          },
          createdAt: w.createdAt
        };
      });
      break;
    }

    case 'salesFollowups': {
      metricLabel = 'Sales Follow-ups';
      const fuDateMatch = {};
      if (start || end) {
        fuDateMatch.followUpDate = {};
        if (start) fuDateMatch.followUpDate.$gte = start;
        if (end) fuDateMatch.followUpDate.$lte = end;
      }
      const followUps = await FollowUp.find({ ...activityAgentMatch, ...fuDateMatch })
        .populate({
          path: 'lead',
          select: 'organizationName leadNumber address closureStatus primaryContact',
          populate: { path: 'primaryContact', select: 'name phone' }
        })
        .populate('salesAgent', 'fullName username agentRole')
        .populate('assignedBy', 'fullName username')
        .sort({ followUpDate: -1, createdAt: -1 })
        .lean();

      rawItems = followUps.map(f => {
        const leadObj = f.lead || {};
        return {
          id: f._id.toString(),
          leadId: leadObj._id ? leadObj._id.toString() : '',
          leadNumber: leadObj.leadNumber || 'N/A',
          hospitalName: leadObj.organizationName || 'N/A',
          hospitalAddress: leadObj.address || 'N/A',
          contactPhone: leadObj.primaryContact?.phone || 'N/A',
          contactName: leadObj.primaryContact?.name || 'N/A',
          date: f.followUpDate,
          dateFormatted: formatISTDateOnly(f.followUpDate),
          time: f.followUpTime || 'N/A',
          status: f.status || 'Scheduled',
          assignedAgent: f.salesAgent?.fullName || f.salesAgent?.username || 'Unassigned',
          assignedRole: f.salesAgent?.agentRole || 'Sales Agent',
          scheduledBy: f.assignedBy?.fullName || f.assignedBy?.username || 'N/A',
          remarks: f.remarks || 'Sales follow-up scheduled',
          extra: {},
          createdAt: f.createdAt
        };
      });
      break;
    }

    case 'followups': {
      metricLabel = 'Follow-ups';
      const fuDateMatch = {};
      if (start || end) {
        fuDateMatch.followUpDate = {};
        if (start) fuDateMatch.followUpDate.$gte = start;
        if (end) fuDateMatch.followUpDate.$lte = end;
      }

      const fuDocs = await FollowUp.find({ ...activityAgentMatch, ...fuDateMatch })
        .populate({
          path: 'lead',
          select: 'organizationName leadNumber address closureStatus primaryContact currentOwner nextFollowUpAt',
          populate: [
            { path: 'primaryContact', select: 'name phone' },
            { path: 'currentOwner', select: 'fullName username agentRole' }
          ]
        })
        .populate('salesAgent', 'fullName username agentRole')
        .populate('assignedBy', 'fullName username')
        .sort({ followUpDate: -1 })
        .lean();

      const leadFuMatch = { ...agentLeadMatch, closureStatus: 'OPEN' };
      if (start || end) {
        leadFuMatch.nextFollowUpAt = {};
        if (start) leadFuMatch.nextFollowUpAt.$gte = start;
        if (end) leadFuMatch.nextFollowUpAt.$lte = end;
      } else {
        leadFuMatch.nextFollowUpAt = { $exists: true, $ne: null };
      }
      const leadsWithFu = await Lead.find(leadFuMatch)
        .populate('currentOwner', 'fullName username agentRole')
        .populate('primaryContact', 'name phone')
        .sort({ nextFollowUpAt: 1 })
        .lean();

      // Deduplicate distinct follow-up items by lead ID to match exact count
      const leadItemMap = new Map();

      fuDocs.forEach(f => {
        const leadObj = f.lead || {};
        const lid = leadObj._id ? leadObj._id.toString() : f._id.toString();
        leadItemMap.set(lid, {
          id: f._id.toString(),
          leadId: leadObj._id ? leadObj._id.toString() : '',
          leadNumber: leadObj.leadNumber || 'N/A',
          hospitalName: leadObj.organizationName || 'N/A',
          hospitalAddress: leadObj.address || 'N/A',
          contactPhone: leadObj.primaryContact?.phone || 'N/A',
          contactName: leadObj.primaryContact?.name || 'N/A',
          date: f.followUpDate,
          dateFormatted: formatISTDateOnly(f.followUpDate),
          time: f.followUpTime || 'N/A',
          status: f.status || 'Scheduled',
          assignedAgent: f.salesAgent?.fullName || f.salesAgent?.username || leadObj.currentOwner?.fullName || 'Unassigned',
          assignedRole: f.salesAgent?.agentRole || leadObj.currentOwner?.agentRole || 'Agent',
          scheduledBy: f.assignedBy?.fullName || f.assignedBy?.username || 'N/A',
          remarks: f.remarks || 'Follow-up scheduled',
          extra: {},
          createdAt: f.createdAt
        });
      });

      leadsWithFu.forEach(l => {
        const lid = l._id.toString();
        if (!leadItemMap.has(lid)) {
          leadItemMap.set(lid, {
            id: l._id.toString(),
            leadId: l._id.toString(),
            leadNumber: l.leadNumber || 'N/A',
            hospitalName: l.organizationName || 'N/A',
            hospitalAddress: l.address || 'N/A',
            contactPhone: l.primaryContact?.phone || 'N/A',
            contactName: l.primaryContact?.name || 'N/A',
            date: l.nextFollowUpAt,
            dateFormatted: formatISTDateTime(l.nextFollowUpAt),
            time: '',
            status: 'Scheduled',
            assignedAgent: l.currentOwner?.fullName || l.currentOwner?.username || 'Unassigned',
            assignedRole: l.currentOwner?.agentRole || 'Agent',
            scheduledBy: l.latestDisposition || 'Follow-up Required',
            remarks: l.latestRemark || l.remarks || 'Next follow-up due',
            extra: {},
            createdAt: l.createdAt
          });
        }
      });

      rawItems = Array.from(leadItemMap.values());
      break;
    }

    case 'overdueFollowups': {
      metricLabel = 'Overdue Follow-ups';
      const overdueLimit = (end && end < now) ? end : now;
      let overdueLeads = [];
      if (!(start && start >= now)) {
        const overdueLeadMatch = {
          ...agentLeadMatch,
          closureStatus: 'OPEN',
          nextFollowUpAt: {
            $lt: overdueLimit,
            $gt: new Date(0),
            ...(start ? { $gte: start } : {})
          }
        };
        overdueLeads = await Lead.find(overdueLeadMatch)
          .populate('currentOwner', 'fullName username agentRole')
          .populate('primaryContact', 'name phone')
          .sort({ nextFollowUpAt: 1 })
          .lean();
      }

      rawItems = overdueLeads.map(l => ({
        id: l._id.toString(),
        leadId: l._id.toString(),
        leadNumber: l.leadNumber || 'N/A',
        hospitalName: l.organizationName || 'N/A',
        hospitalAddress: l.address || 'N/A',
        contactPhone: l.primaryContact?.phone || 'N/A',
        contactName: l.primaryContact?.name || 'N/A',
        date: l.nextFollowUpAt,
        dateFormatted: formatISTDateTime(l.nextFollowUpAt),
        time: '',
        status: 'Overdue',
        assignedAgent: l.currentOwner?.fullName || l.currentOwner?.username || 'Unassigned',
        assignedRole: l.currentOwner?.agentRole || 'Agent',
        scheduledBy: l.latestDisposition || 'Overdue Follow-up',
        remarks: l.latestRemark || l.remarks || 'Follow-up past scheduled date',
        extra: {},
        createdAt: l.createdAt
      }));
      break;
    }

    case 'won': {
      metricLabel = 'Leads Won';
      const wonMatch = {
        closureStatus: 'WON',
        ...(targetAgentId ? { $or: [{ currentOwner: targetAgentId }, { createdBy: targetAgentId }, { closedBy: targetAgentId }] } : {})
      };
      if (start || end) {
        const dateRange = { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };
        wonMatch.$or = [
          { closedAt: dateRange },
          { closedAt: null, updatedAt: dateRange },
          { closedAt: { $exists: false }, updatedAt: dateRange }
        ];
      }
      const wonLeads = await Lead.find(wonMatch)
        .populate('currentOwner', 'fullName username agentRole')
        .populate('closedBy', 'fullName username')
        .populate('primaryContact', 'name phone')
        .sort({ closedAt: -1, updatedAt: -1 })
        .lean();

      rawItems = wonLeads.map(l => {
        const closedTime = l.closedAt || l.updatedAt;
        return {
          id: l._id.toString(),
          leadId: l._id.toString(),
          leadNumber: l.leadNumber || 'N/A',
          hospitalName: l.organizationName || 'N/A',
          hospitalAddress: l.address || 'N/A',
          contactPhone: l.primaryContact?.phone || 'N/A',
          contactName: l.primaryContact?.name || 'N/A',
          date: closedTime,
          dateFormatted: formatISTDateTime(closedTime),
          time: '',
          status: 'WON',
          assignedAgent: l.currentOwner?.fullName || l.currentOwner?.username || 'Unassigned',
          assignedRole: l.currentOwner?.agentRole || 'Sales Agent',
          scheduledBy: l.closedBy?.fullName || l.closedBy?.username || 'N/A',
          remarks: l.remarks || 'Deal closed successfully',
          extra: { dealValue: l.dealValue || 0, product: l.product || 'N/A' },
          createdAt: l.createdAt
        };
      });
      break;
    }

    case 'lost': {
      metricLabel = 'Leads Lost';
      const lostMatch = {
        closureStatus: 'LOST',
        ...(targetAgentId ? { $or: [{ currentOwner: targetAgentId }, { createdBy: targetAgentId }, { closedBy: targetAgentId }] } : {})
      };
      if (start || end) {
        const dateRange = { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };
        lostMatch.$or = [
          { closedAt: dateRange },
          { closedAt: null, updatedAt: dateRange },
          { closedAt: { $exists: false }, updatedAt: dateRange }
        ];
      }
      const lostLeads = await Lead.find(lostMatch)
        .populate('currentOwner', 'fullName username agentRole')
        .populate('closedBy', 'fullName username')
        .populate('primaryContact', 'name phone')
        .sort({ closedAt: -1, updatedAt: -1 })
        .lean();

      rawItems = lostLeads.map(l => {
        const closedTime = l.closedAt || l.updatedAt;
        return {
          id: l._id.toString(),
          leadId: l._id.toString(),
          leadNumber: l.leadNumber || 'N/A',
          hospitalName: l.organizationName || 'N/A',
          hospitalAddress: l.address || 'N/A',
          contactPhone: l.primaryContact?.phone || 'N/A',
          contactName: l.primaryContact?.name || 'N/A',
          date: closedTime,
          dateFormatted: formatISTDateTime(closedTime),
          time: '',
          status: 'LOST',
          assignedAgent: l.currentOwner?.fullName || l.currentOwner?.username || 'Unassigned',
          assignedRole: l.currentOwner?.agentRole || 'Sales Agent',
          scheduledBy: l.closedBy?.fullName || l.closedBy?.username || 'N/A',
          remarks: l.lostReason ? `Lost Reason: ${l.lostReason}` : (l.remarks || 'Deal lost'),
          extra: { lostReason: l.lostReason || 'N/A' },
          createdAt: l.createdAt
        };
      });
      break;
    }

    default:
      break;
  }

  // Sort newest first
  rawItems.sort((a, b) => {
    const timeA = a.date ? new Date(a.date).getTime() : 0;
    const timeB = b.date ? new Date(b.date).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return createdB - createdA;
  });

  // Apply search filtering
  let filtered = rawItems;
  if (search) {
    const s = search.toLowerCase();
    filtered = rawItems.filter(item => {
      return (
        (item.hospitalName && item.hospitalName.toLowerCase().includes(s)) ||
        (item.leadNumber && item.leadNumber.toLowerCase().includes(s)) ||
        (item.remarks && item.remarks.toLowerCase().includes(s)) ||
        (item.assignedAgent && item.assignedAgent.toLowerCase().includes(s)) ||
        (item.callerName && item.callerName.toLowerCase().includes(s)) ||
        (item.disposition && item.disposition.toLowerCase().includes(s)) ||
        (item.scheduledBy && item.scheduledBy.toLowerCase().includes(s)) ||
        (item.status && item.status.toLowerCase().includes(s)) ||
        (item.leadStatus && item.leadStatus.toLowerCase().includes(s)) ||
        (item.contactPhone && item.contactPhone.toLowerCase().includes(s)) ||
        (item.contactName && item.contactName.toLowerCase().includes(s))
      );
    });
  }

  const uniqueHospitalIds = new Set(filtered.map(r => r.leadId).filter(Boolean));
  const totalRecords = filtered.length;
  const totalPages = Math.ceil(totalRecords / limit) || 1;
  const startIndex = (page - 1) * limit;
  const pagedRecords = filtered.slice(startIndex, startIndex + limit);

  let dateLabel = 'All Time';
  if (start && end) {
    const sStr = formatISTDateOnly(start);
    const eStr = formatISTDateOnly(end);
    dateLabel = sStr === eStr ? sStr : `${sStr} — ${eStr}`;
  } else if (start) {
    dateLabel = `From ${formatISTDateOnly(start)}`;
  } else if (end) {
    dateLabel = `Until ${formatISTDateOnly(end)}`;
  }

  return {
    success: true,
    metric,
    metricLabel,
    dateLabel,
    agentLabel: targetAgent ? (targetAgent.fullName || targetAgent.username) : 'All Agents',
    totalRecords,
    uniqueHospitals: uniqueHospitalIds.size,
    pagination: {
      page,
      limit,
      totalPages,
      totalRecords
    },
    records: pagedRecords,
    allFilteredRecords: filtered
  };
}

exports.dashboardMetricRecords = async (req, res, next) => {
  try {
    const query = { ...req.query };
    if (req.user && req.user.role === 'AGENT') {
      query.agentId = req.user._id.toString();
    }
    const data = await fetchDashboardMetricRecords(query);
    const { allFilteredRecords, ...result } = data;
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.exportDashboardMetricRecords = async (req, res, next) => {
  try {
    const format = (req.query.format || 'xlsx').toLowerCase();
    const query = { ...req.query, page: 1, limit: 10000 };
    if (req.user && req.user.role === 'AGENT') {
      query.agentId = req.user._id.toString();
    }
    const data = await fetchDashboardMetricRecords(query);
    const { metric, metricLabel, dateLabel, agentLabel, totalRecords, uniqueHospitals, allFilteredRecords } = data;

    const isCall = metric === 'calls';

    if (format === 'csv') {
      const headers = isCall ? [
        'Metric',
        'Hospital Name',
        'Lead ID / Number',
        'Call Date & Time (IST)',
        'Contact Number',
        'Contact Name',
        'Caller / Agent Name',
        'Call Disposition',
        'Lead Status',
        'Hospital Address',
        'Call Remarks / Notes'
      ] : [
        'Metric',
        'Hospital Name',
        'Lead ID / Number',
        'Date & Time (IST)',
        'Status',
        'Assigned Agent',
        'Scheduled By / Origin',
        'Hospital Address',
        'Contact Phone',
        'Remarks / Notes'
      ];
      const rows = allFilteredRecords.map(r => isCall ? [
        sanitizeExportCell(metricLabel),
        sanitizeExportCell(r.hospitalName),
        sanitizeExportCell(r.leadNumber),
        sanitizeExportCell(r.dateFormatted + (r.time ? ` ${r.time}` : '')),
        sanitizeExportCell(r.contactPhone),
        sanitizeExportCell(r.contactName),
        sanitizeExportCell(r.callerName || r.assignedAgent),
        sanitizeExportCell(r.disposition || r.scheduledBy),
        sanitizeExportCell(r.status),
        sanitizeExportCell(r.hospitalAddress),
        sanitizeExportCell(r.remarks)
      ] : [
        sanitizeExportCell(metricLabel),
        sanitizeExportCell(r.hospitalName),
        sanitizeExportCell(r.leadNumber),
        sanitizeExportCell(r.dateFormatted + (r.time ? ` ${r.time}` : '')),
        sanitizeExportCell(r.status),
        sanitizeExportCell(r.assignedAgent),
        sanitizeExportCell(r.scheduledBy),
        sanitizeExportCell(r.hospitalAddress),
        sanitizeExportCell(r.contactPhone),
        sanitizeExportCell(r.remarks)
      ]);
      const csvContent = '\uFEFF' + [
        headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
        ...rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      ].join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${metric}_records.csv"`);
      return res.status(200).send(csvContent);
    }

    // Default: Multi-sheet Excel
    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const summarySheetRows = [
      { Metric: 'Report Metric', Value: metricLabel },
      { Metric: 'Selected Period', Value: dateLabel },
      { Metric: 'Selected Agent', Value: agentLabel },
      { Metric: 'Total Records Matching', Value: totalRecords },
      { Metric: 'Unique Hospitals', Value: uniqueHospitals },
      { Metric: 'Exported At (IST)', Value: formatISTDateTime(new Date()) },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summarySheetRows);
    wsSummary['!cols'] = [{ wch: 28 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // Records Sheet
    const recordsRows = allFilteredRecords.map(r => isCall ? ({
      'Hospital Name': sanitizeExportCell(r.hospitalName),
      'Lead Number': sanitizeExportCell(r.leadNumber),
      'Call Date & Time (IST)': sanitizeExportCell(r.dateFormatted + (r.time ? ` ${r.time}` : '')),
      'Contact Number': sanitizeExportCell(r.contactPhone),
      'Contact Name': sanitizeExportCell(r.contactName),
      'Caller / Agent Name': sanitizeExportCell(r.callerName || r.assignedAgent),
      'Call Disposition': sanitizeExportCell(r.disposition || r.scheduledBy),
      'Lead Status': sanitizeExportCell(r.status),
      'Hospital Address': sanitizeExportCell(r.hospitalAddress),
      'Call Remarks / Notes': sanitizeExportCell(r.remarks),
    }) : ({
      'Hospital Name': sanitizeExportCell(r.hospitalName),
      'Lead Number': sanitizeExportCell(r.leadNumber),
      'Date & Time (IST)': sanitizeExportCell(r.dateFormatted + (r.time ? ` ${r.time}` : '')),
      'Status': sanitizeExportCell(r.status),
      'Assigned Agent': sanitizeExportCell(r.assignedAgent),
      'Scheduled By / Origin': sanitizeExportCell(r.scheduledBy),
      'Hospital Address': sanitizeExportCell(r.hospitalAddress),
      'Contact Phone': sanitizeExportCell(r.contactPhone),
      'Remarks / Notes': sanitizeExportCell(r.remarks),
    }));
    const wsRecords = XLSX.utils.json_to_sheet(recordsRows.length ? recordsRows : [{ Note: 'No records found matching criteria' }]);
    wsRecords['!cols'] = isCall ? [
      { wch: 32 }, // Hospital Name
      { wch: 16 }, // Lead Number
      { wch: 24 }, // Call Date & Time (IST)
      { wch: 18 }, // Contact Number
      { wch: 20 }, // Contact Name
      { wch: 22 }, // Caller / Agent Name
      { wch: 20 }, // Call Disposition
      { wch: 14 }, // Lead Status
      { wch: 32 }, // Hospital Address
      { wch: 40 }, // Call Remarks / Notes
    ] : [
      { wch: 30 },
      { wch: 14 },
      { wch: 22 },
      { wch: 14 },
      { wch: 22 },
      { wch: 22 },
      { wch: 30 },
      { wch: 18 },
      { wch: 40 },
    ];
    XLSX.utils.book_append_sheet(wb, wsRecords, `${metricLabel.substring(0, 31)}`);

    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${metric}_records.xlsx"`);
    res.setHeader('Content-Length', excelBuffer.length);
    return res.status(200).send(excelBuffer);
  } catch (err) {
    next(err);
  }
};

exports.fetchDashboardMetricRecords = fetchDashboardMetricRecords;



