const Lead = require('../models/Lead');
const User = require('../models/User');

function parseDateRange(query) {
  const startDate = query.startDate || query.start;
  const endDate = query.endDate || query.end;
  let start = startDate ? new Date(startDate) : null;
  let end = endDate ? new Date(endDate) : null;
  if (start && isNaN(start)) start = null;
  if (end && isNaN(end)) end = null;
  return { start, end };
}

exports.adminDashboard = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req.query);
    const agentFilter = req.query.agentId;

    const mongoose = require('mongoose');
    const match = {};
    if (agentFilter) match.currentOwner = { $eq: new mongoose.Types.ObjectId(agentFilter) };
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = start;
      if (end) match.createdAt.$lte = end;
    }

    const now = new Date();

    const totalLeadsPromise = Lead.countDocuments(match);

    // upcoming follow-ups: nextFollowUpAt in future within optional end
    const upcomingMatch = Object.assign({}, match);
    upcomingMatch.nextFollowUpAt = { $gte: now };
    if (end) upcomingMatch.nextFollowUpAt.$lte = end;
    const upcomingPromise = Lead.countDocuments(upcomingMatch);

    // overdue: nextFollowUpAt < now and still open
    const overdueMatch = Object.assign({}, match);
    overdueMatch.nextFollowUpAt = { $lt: now };
    overdueMatch.closureStatus = 'OPEN';
    const overduePromise = Lead.countDocuments(overdueMatch);

    const totalAgentsPromise = User.countDocuments({ role: 'AGENT' });

    const wonMatch = Object.assign({}, match);
    wonMatch.closureStatus = 'WON';
    const wonPromise = Lead.countDocuments(wonMatch);

    const lostMatch = Object.assign({}, match);
    lostMatch.closureStatus = 'LOST';
    const lostPromise = Lead.countDocuments(lostMatch);

    const [totalLeads, upcomingFollowups, overdueFollowups, totalAgents, totalWon, totalLost] = await Promise.all([
      totalLeadsPromise, upcomingPromise, overduePromise, totalAgentsPromise, wonPromise, lostPromise
    ]);

    res.json({ totalLeads, upcomingFollowups, overdueFollowups, totalAgents, totalWon, totalLost });
  } catch (err) {
    next(err);
  }
};

exports.agentDashboard = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req.query);
    const owner = req.userId;

    const mongoose = require('mongoose');
    const match = { currentOwner: new mongoose.Types.ObjectId(owner) };
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = start;
      if (end) match.createdAt.$lte = end;
    }

    const now = new Date();

    const totalLeadsPromise = Lead.countDocuments(match);
    const upcomingPromise = Lead.countDocuments(Object.assign({}, match, { nextFollowUpAt: { $gte: now, ...(end ? { $lte: end } : {}) } }));
    const overduePromise = Lead.countDocuments(Object.assign({}, match, { nextFollowUpAt: { $lt: now }, closureStatus: 'OPEN' }));
    const wonPromise = Lead.countDocuments(Object.assign({}, match, { closureStatus: 'WON' }));
    const lostPromise = Lead.countDocuments(Object.assign({}, match, { closureStatus: 'LOST' }));

    const [totalLeads, upcomingFollowups, overdueFollowups, totalWon, totalLost] = await Promise.all([
      totalLeadsPromise, upcomingPromise, overduePromise, wonPromise, lostPromise
    ]);

    res.json({ totalLeads, upcomingFollowups, overdueFollowups, totalWon, totalLost });
  } catch (err) {
    next(err);
  }
};
