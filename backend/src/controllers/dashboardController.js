const Lead = require('../models/Lead');
const User = require('../models/User');
const CallLog = require('../models/CallLog');
const WalkIn = require('../models/WalkIn');
const Demo = require('../models/Demo');
const LeadActivity = require('../models/LeadActivity');

function parseDateRange(query) {
  const startDate = query.startDate || query.start;
  const endDate = query.endDate || query.end;
  let start = null;
  let end = null;
  if (startDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      const [sy, sm, sd] = startDate.split('-').map(Number);
      start = new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0, 0));
    } else {
      start = new Date(startDate);
      if (isNaN(start.getTime())) start = null;
    }
  }
  if (endDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      const [ey, em, ed] = endDate.split('-').map(Number);
      end = new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59, 999));
    } else {
      end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        end.setUTCHours(23, 59, 59, 999);
      } else {
        end = null;
      }
    }
  }
  return { start, end };
}

exports.adminDashboard = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req.query);
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
        match.currentOwner = targetAgentId;
      }
    }
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = start;
      if (end) match.createdAt.$lte = end;
    }

    const now = new Date();

    const totalLeadsPromise = Lead.countDocuments(match);

    // upcoming follow-ups: nextFollowUpAt in future within optional end, only for OPEN leads
    const upcomingMatch = Object.assign({}, match);
    upcomingMatch.closureStatus = 'OPEN';
    upcomingMatch.nextFollowUpAt = { $gte: now };
    if (end) upcomingMatch.nextFollowUpAt.$lte = end;
    const upcomingPromise = Lead.countDocuments(upcomingMatch);

    // overdue: nextFollowUpAt < now and still open
    const overdueMatch = Object.assign({}, match);
    overdueMatch.closureStatus = 'OPEN';
    overdueMatch.nextFollowUpAt = { $lt: now, $gt: new Date(0) };
    const overduePromise = Lead.countDocuments(overdueMatch);

    const totalAgentsPromise = targetAgentId
      ? Promise.resolve(1)
      : User.countDocuments({ role: 'AGENT' });

    const wonMatch = Object.assign({}, match);
    wonMatch.closureStatus = 'WON';
    const wonPromise = Lead.countDocuments(wonMatch);

    const lostMatch = Object.assign({}, match);
    lostMatch.closureStatus = 'LOST';
    const lostPromise = Lead.countDocuments(lostMatch);

    const activeAgents = await User.find({ role: 'AGENT', active: true }).select('_id');
    const activeAgentIds = activeAgents.map((a) => a._id);

    let assignedToActiveMatch;
    if (targetAgentId) {
      const isAgentActive = activeAgentIds.some((id) => id.toString() === targetAgentId.toString());
      assignedToActiveMatch = isAgentActive ? Object.assign({}, match) : null;
    } else {
      assignedToActiveMatch = Object.assign({}, match, { currentOwner: { $in: activeAgentIds } });
    }
    const assignedToActivePromise = assignedToActiveMatch
      ? Lead.countDocuments(assignedToActiveMatch)
      : Promise.resolve(0);

    const [totalLeads, upcomingFollowups, overdueFollowups, totalAgents, totalWon, totalLost, assignedToActiveLeads] = await Promise.all([
      totalLeadsPromise, upcomingPromise, overduePromise, totalAgentsPromise, wonPromise, lostPromise, assignedToActivePromise
    ]);

    const unassignedLeads = Math.max(0, totalLeads - assignedToActiveLeads);

    res.json({ totalLeads, unassignedLeads, upcomingFollowups, overdueFollowups, totalAgents, totalWon, totalLost });
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

    const matchOwner = { currentOwner: ownerObjId };

    // 1. My Total Leads
    const totalLeadsPromise = Lead.countDocuments(matchOwner);

    // 2. Today's Follow-ups (scheduled for today and still OPEN)
    const todayFollowupsPromise = Lead.countDocuments({
      currentOwner: ownerObjId,
      closureStatus: 'OPEN',
      nextFollowUpAt: { $gte: startOfToday, $lte: endOfToday }
    });

    // 3. Overdue Follow-ups (scheduled in the past before now and still OPEN)
    const overdueFollowupsPromise = Lead.countDocuments({
      currentOwner: ownerObjId,
      closureStatus: 'OPEN',
      nextFollowUpAt: { $lt: now, $gt: new Date(0) }
    });

    // 4. Upcoming Follow-ups (scheduled at or after now and still OPEN)
    const upcomingFollowupsPromise = Lead.countDocuments({
      currentOwner: ownerObjId,
      closureStatus: 'OPEN',
      nextFollowUpAt: { $gte: now }
    });

    // Get lead IDs owned by agent for cross-referencing Demos and Walk-ins
    const agentLeads = await Lead.find(matchOwner).select('_id').lean();
    const agentLeadIds = agentLeads.map(l => l._id);

    // 5. Today's Scheduled Demos
    const todayDemosPromise = Demo.countDocuments({
      $or: [
        { salesAgent: ownerObjId },
        { lead: { $in: agentLeadIds } }
      ],
      demoDate: { $gte: startOfToday, $lte: endOfToday }
    });

    // 6. Today's Walk-ins
    const todayWalkInsPromise = WalkIn.countDocuments({
      $or: [
        { salesAgent: ownerObjId },
        { lead: { $in: agentLeadIds } }
      ],
      $or: [
        { walkInDate: { $gte: startOfToday, $lte: endOfToday } },
        { createdAt: { $gte: startOfToday, $lte: endOfToday } }
      ]
    });

    // 7. Won Leads
    const wonLeadsPromise = Lead.countDocuments({ currentOwner: ownerObjId, closureStatus: 'WON' });

    // 8. Lost Leads
    const lostLeadsPromise = Lead.countDocuments({ currentOwner: ownerObjId, closureStatus: 'LOST' });

    // 9. Actionable leads:
    // Overdue Leads
    const overdueLeadsPromise = Lead.find({
      currentOwner: ownerObjId,
      closureStatus: 'OPEN',
      nextFollowUpAt: { $lt: now, $gt: new Date(0) }
    })
      .sort({ nextFollowUpAt: 1 })
      .limit(30)
      .populate('primaryContact')
      .lean();

    // Today's Follow-up Leads (scheduled for today)
    const todayFollowupLeadsPromise = Lead.find({
      currentOwner: ownerObjId,
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
      currentOwner: ownerObjId,
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
        match.currentOwner = targetAgentId;
      }
    }
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = start;
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
    const activityMatch = {};
    if (targetAgentId) activityMatch.salesAgent = targetAgentId;
    if (start || end) {
      activityMatch.createdAt = {};
      if (start) activityMatch.createdAt.$gte = start;
      if (end) activityMatch.createdAt.$lte = end;
    }
    const callMatch = {};
    if (targetAgentId) callMatch.user = targetAgentId;
    if (start || end) {
      callMatch.calledAt = {};
      if (start) callMatch.calledAt.$gte = start;
      if (end) callMatch.calledAt.$lte = end;
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

    // 9. Agent Performance Table
    let targetAgentsList = [];
    if (targetAgentId) {
      const singleAgent = await User.findById(targetAgentId)
        .select('fullName username agentRole role active')
        .lean();
      if (singleAgent) targetAgentsList = [singleAgent];
    } else {
      targetAgentsList = await User.find({ role: 'AGENT', active: true })
        .select('fullName username agentRole role')
        .sort({ fullName: 1, username: 1 })
        .lean();
    }

    const dateCallMatch = (agentId) => {
      const cm = { user: agentId };
      if (start || end) {
        cm.calledAt = {};
        if (start) cm.calledAt.$gte = start;
        if (end) cm.calledAt.$lte = end;
      }
      return cm;
    };

    const dateActivityMatch = (agentId) => {
      const am = { salesAgent: agentId };
      if (start || end) {
        am.createdAt = {};
        if (start) am.createdAt.$gte = start;
        if (end) am.createdAt.$lte = end;
      }
      return am;
    };

    const agentPerformance = await Promise.all(
      targetAgentsList.map(async (agent) => {
        const aId = agent._id;
        const aCallMatch = dateCallMatch(aId);
        const aActMatch = dateActivityMatch(aId);

        const aCallsPromise = CallLog.countDocuments(aCallMatch);
        const aWalkInsPromise = WalkIn.countDocuments(aActMatch);
        const aDemosPromise = Demo.countDocuments(aActMatch);
        const aDemosDonePromise = Demo.countDocuments({ ...aActMatch, status: 'Done' });
        const aDemosNotDonePromise = Demo.countDocuments({ ...aActMatch, status: 'Not Done' });
        const aFollowUpsSchedPromise = CallLog.countDocuments({
          ...aCallMatch,
          followUpAt: { $exists: true, $ne: null }
        });
        const aWonPromise = Lead.countDocuments(Object.assign({}, match, { currentOwner: aId, closureStatus: 'WON' }));
        const aLostPromise = Lead.countDocuments(Object.assign({}, match, { currentOwner: aId, closureStatus: 'LOST' }));

        const aFollowUpsCompPromise = (async () => {
          try {
            const calls = await CallLog.find(aCallMatch).select('lead calledAt').lean();
            const leadIds = calls.map(c => c.lead);
            const priors = leadIds.length ? await CallLog.find({
              lead: { $in: leadIds },
              followUpAt: { $exists: true, $ne: null }
            }).select('lead calledAt followUpAt').lean() : [];

            const priorMap = {};
            for (const p of priors) {
              const lid = p.lead.toString();
              if (!priorMap[lid]) priorMap[lid] = [];
              priorMap[lid].push(p);
            }

            let compCount = 0;
            for (const call of calls) {
              const lid = call.lead.toString();
              const scheds = priorMap[lid];
              if (scheds && scheds.some(s => s.calledAt < call.calledAt)) {
                compCount++;
              }
            }

            // Direct completions by this agent
            const aCompActMatch = { action: 'Follow-up Completed', performedBy: aId };
            if (start || end) {
              aCompActMatch.createdAt = {};
              if (start) aCompActMatch.createdAt.$gte = start;
              if (end) aCompActMatch.createdAt.$lte = end;
            }
            const directCompCount = await LeadActivity.countDocuments(aCompActMatch);

            return compCount + directCompCount;
          } catch (e) {
            return 0;
          }
        })();

        const [
          callsLogged,
          walkIns,
          demosScheduled,
          demosCompleted,
          demosNotDone,
          followUpsScheduled,
          followUpsCompleted,
          wonLeads,
          lostLeads
        ] = await Promise.all([
          aCallsPromise,
          aWalkInsPromise,
          aDemosPromise,
          aDemosDonePromise,
          aDemosNotDonePromise,
          aFollowUpsSchedPromise,
          aFollowUpsCompPromise,
          aWonPromise,
          aLostPromise
        ]);

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
          lostLeads
        };
      })
    );

    // 10. Date-wise Activity Report
    const startStr = req.query.startDate || (start ? start.toISOString().slice(0, 10) : null);
    const endStr = req.query.endDate || (end ? end.toISOString().slice(0, 10) : null);

    let dateList = [];
    if (startStr && endStr) {
      const [sy, sm, sd] = startStr.slice(0, 10).split('-').map(Number);
      const [ey, em, ed] = endStr.slice(0, 10).split('-').map(Number);
      const cur = new Date(Date.UTC(sy, sm - 1, sd));
      const last = new Date(Date.UTC(ey, em - 1, ed));
      while (cur <= last) {
        const y = cur.getUTCFullYear();
        const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
        const d = String(cur.getUTCDate()).padStart(2, '0');
        dateList.push(`${y}-${m}-${d}`);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    } else {
      const today = new Date();
      const y = today.getUTCFullYear();
      const m = String(today.getUTCMonth() + 1).padStart(2, '0');
      const d = String(today.getUTCDate()).padStart(2, '0');
      dateList = [`${y}-${m}-${d}`];
    }

    // Fetch activity data for date-wise grouping
    const [
      callsInPeriod,
      walkInsInPeriod,
      demosInPeriod,
      wonLeadsInPeriod,
      lostLeadsInPeriod,
      followUpsCompInPeriod
    ] = await Promise.all([
      CallLog.find(callMatch).select('lead calledAt followUpAt').lean(),
      WalkIn.find(activityMatch).select('createdAt walkInDate').lean(),
      Demo.find(activityMatch).select('createdAt demoDate status').lean(),
      Lead.find(wonLeadMatch).select('createdAt').lean(),
      Lead.find(lostLeadMatch).select('createdAt').lean(),
      LeadActivity.find({
        action: 'Follow-up Completed',
        ...(targetAgentId ? { performedBy: targetAgentId } : {}),
        ...(start || end ? { createdAt: { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) } } : {})
      }).select('createdAt performedBy').lean()
    ]);

    // Build map for follow-ups completed
    const leadIdsInPeriod = [...new Set(callsInPeriod.map(c => c.lead.toString()))];
    const priorsInPeriod = leadIdsInPeriod.length ? await CallLog.find({
      lead: { $in: leadIdsInPeriod },
      followUpAt: { $exists: true, $ne: null }
    }).select('lead calledAt followUpAt').lean() : [];

    const datePriorMap = {};
    for (const p of priorsInPeriod) {
      const lid = p.lead.toString();
      if (!datePriorMap[lid]) datePriorMap[lid] = [];
      datePriorMap[lid].push(p);
    }

    const dateWiseReport = dateList.map((dateKey) => {
      // Calls on this date
      const callsOnDate = callsInPeriod.filter((c) => {
        const dStr = c.calledAt ? c.calledAt.toISOString().slice(0, 10) : '';
        return dStr === dateKey;
      });
      const callsLogged = callsOnDate.length;
      const followUpsScheduled = callsOnDate.filter((c) => c.followUpAt != null).length;

      let followUpsCompleted = 0;
      for (const call of callsOnDate) {
        const lid = call.lead.toString();
        const priors = datePriorMap[lid];
        if (priors && priors.some((p) => p.calledAt < call.calledAt)) {
          followUpsCompleted++;
        }
      }

      const directCompsOnDate = followUpsCompInPeriod.filter((a) => {
        const dStr = a.createdAt ? a.createdAt.toISOString().slice(0, 10) : '';
        return dStr === dateKey;
      }).length;
      followUpsCompleted += directCompsOnDate;

      // Walk-ins on this date (activity logged on date)
      const walkIns = walkInsInPeriod.filter((w) => {
        const dStr = w.createdAt ? w.createdAt.toISOString().slice(0, 10) : '';
        return dStr === dateKey;
      }).length;

      // Demos on this date (activity logged on date)
      const demosOnDate = demosInPeriod.filter((d) => {
        const dStr = d.createdAt ? d.createdAt.toISOString().slice(0, 10) : '';
        return dStr === dateKey;
      });
      const demosScheduled = demosOnDate.length;
      const demosCompleted = demosOnDate.filter((d) => d.status === 'Done').length;
      const demosNotDone = demosOnDate.filter((d) => d.status === 'Not Done').length;

      // Won & Lost leads on this date
      const wonLeads = wonLeadsInPeriod.filter((l) => {
        const dStr = l.createdAt ? l.createdAt.toISOString().slice(0, 10) : '';
        return dStr === dateKey;
      }).length;

      const lostLeads = lostLeadsInPeriod.filter((l) => {
        const dStr = l.createdAt ? l.createdAt.toISOString().slice(0, 10) : '';
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
      agentPerformance,
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
