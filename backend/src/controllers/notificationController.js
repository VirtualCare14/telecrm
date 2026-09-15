const Lead = require('../models/Lead');
const LeadTransferRequest = require('../models/LeadTransferRequest');
const NotificationRead = require('../models/NotificationRead');

exports.getNotifications = async (req, res, next) => {
  try {
    const userId = req.userId;
    const userRole = req.userRole || req.user?.role;
    const isAdmin = userRole === 'ADMIN' || (req.user?.agentRole && req.user.agentRole.toLowerCase() === 'admin');

    const now = new Date();
    const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000); // next 48 hours
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // 1. Overdue Follow-ups (Only OPEN leads where nextFollowUpAt < now)
    const overdueMatch = {
      closureStatus: 'OPEN',
      nextFollowUpAt: { $lt: now, $gt: new Date(0) },
    };
    if (!isAdmin) {
      overdueMatch.currentOwner = userId;
    }

    const overdueLeads = await Lead.find(overdueMatch)
      .sort({ nextFollowUpAt: 1 })
      .limit(30)
      .populate('currentOwner', 'fullName username')
      .lean();

    const overdueAlerts = overdueLeads.map((l) => {
      const leadName = l.organizationName || l.leadNumber || 'Lead';
      return {
        id: `overdue_${l._id}_${new Date(l.nextFollowUpAt).getTime()}`,
        type: 'overdue',
        category: 'Overdue Follow-up',
        title: `Overdue: ${leadName}`,
        message: `Follow-up was scheduled for ${new Date(l.nextFollowUpAt).toLocaleString('en-IN')}`,
        link: `/leads/${l._id}`,
        severity: 'error',
        timestamp: l.nextFollowUpAt,
        leadId: l._id,
        leadName,
        leadNumber: l.leadNumber,
        ownerName: l.currentOwner?.fullName || l.currentOwner?.username,
      };
    });

    // 2. Upcoming Follow-ups (Only OPEN leads within the next 48 hours)
    const upcomingMatch = {
      closureStatus: 'OPEN',
      nextFollowUpAt: { $gte: now, $lte: windowEnd },
    };
    if (!isAdmin) {
      upcomingMatch.currentOwner = userId;
    }

    const upcomingLeads = await Lead.find(upcomingMatch)
      .sort({ nextFollowUpAt: 1 })
      .limit(30)
      .populate('currentOwner', 'fullName username')
      .lean();

    const upcomingAlerts = upcomingLeads.map((l) => {
      const leadName = l.organizationName || l.leadNumber || 'Lead';
      return {
        id: `upcoming_${l._id}_${new Date(l.nextFollowUpAt).getTime()}`,
        type: 'upcoming',
        category: 'Upcoming Follow-up',
        title: `Upcoming: ${leadName}`,
        message: `Scheduled for ${new Date(l.nextFollowUpAt).toLocaleString('en-IN')}`,
        link: `/leads/${l._id}`,
        severity: 'warning',
        timestamp: l.nextFollowUpAt,
        leadId: l._id,
        leadName,
        leadNumber: l.leadNumber,
        ownerName: l.currentOwner?.fullName || l.currentOwner?.username,
      };
    });

    // 3. Newly Assigned Leads (assigned/created within last 7 days)
    let newLeadAlerts = [];
    if (!isAdmin) {
      const newLeads = await Lead.find({
        currentOwner: userId,
        createdAt: { $gte: sevenDaysAgo },
      })
        .sort({ createdAt: -1 })
        .limit(25)
        .lean();

      newLeadAlerts = newLeads.map((l) => {
        const leadName = l.organizationName || l.leadNumber || 'Lead';
        return {
          id: `newlead_${l._id}`,
          type: 'assigned',
          category: 'New Lead Assigned',
          title: `Assigned Lead: ${leadName}`,
          message: `Lead assigned to you (${l.industry || l.leadSource || 'New opportunity'})`,
          link: `/leads/${l._id}`,
          severity: 'info',
          timestamp: l.createdAt,
          leadId: l._id,
          leadName,
          leadNumber: l.leadNumber,
        };
      });
    } else {
      // Admin: Unassigned leads or leads created in the last 48 hours
      const recentAdminLeads = await Lead.find({
        $or: [
          { currentOwner: null },
          { createdAt: { $gte: new Date(now.getTime() - 48 * 60 * 60 * 1000) } },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(25)
        .populate('currentOwner', 'fullName username')
        .lean();

      newLeadAlerts = recentAdminLeads.map((l) => {
        const leadName = l.organizationName || l.leadNumber || 'Lead';
        const isUnassigned = !l.currentOwner;
        return {
          id: `newlead_${l._id}`,
          type: 'assigned',
          category: isUnassigned ? 'Unassigned Lead' : 'Recent Lead',
          title: isUnassigned ? `Unassigned Lead: ${leadName}` : `New Lead: ${leadName}`,
          message: isUnassigned
            ? `Requires agent assignment (${l.leadSource || 'New opportunity'})`
            : `Assigned to ${l.currentOwner?.fullName || 'Unassigned'}`,
          link: `/leads/${l._id}`,
          severity: isUnassigned ? 'warning' : 'info',
          timestamp: l.createdAt,
          leadId: l._id,
          leadName,
          leadNumber: l.leadNumber,
        };
      });
    }

    // 4. Lead Transfers
    let transferAlerts = [];
    if (!isAdmin) {
      const [incomingTransfers, outgoingUpdates] = await Promise.all([
        LeadTransferRequest.find({
          toAgent: userId,
          status: 'Pending',
        })
          .sort({ requestedAt: -1 })
          .populate('lead', 'organizationName leadNumber')
          .populate('fromAgent', 'fullName username')
          .lean(),
        LeadTransferRequest.find({
          fromAgent: userId,
          status: { $in: ['Approved', 'Rejected'] },
          updatedAt: { $gte: sevenDaysAgo },
        })
          .sort({ updatedAt: -1 })
          .populate('lead', 'organizationName leadNumber')
          .populate('toAgent', 'fullName username')
          .lean(),
      ]);

      transferAlerts = [
        ...incomingTransfers.map((t) => ({
          id: `transfer_${t._id}_Pending`,
          type: 'transfer',
          category: 'Incoming Transfer',
          title: `Transfer Request: ${t.lead?.organizationName || t.lead?.leadNumber || 'Lead'}`,
          message: `${t.fromAgent?.fullName || 'An agent'} requested to transfer this lead to you`,
          link: `/transfer-requests`,
          severity: 'warning',
          timestamp: t.requestedAt || t.createdAt,
          leadId: t.lead?._id,
          transferId: t._id,
        })),
        ...outgoingUpdates.map((t) => ({
          id: `transfer_${t._id}_${t.status}`,
          type: 'transfer',
          category: `Transfer ${t.status}`,
          title: `Transfer ${t.status}: ${t.lead?.organizationName || t.lead?.leadNumber || 'Lead'}`,
          message: `Transfer to ${t.toAgent?.fullName || 'agent'} was ${t.status.toLowerCase()}`,
          link: `/transfer-requests`,
          severity: t.status === 'Approved' ? 'success' : 'error',
          timestamp: t.respondedAt || t.updatedAt,
          leadId: t.lead?._id,
          transferId: t._id,
        })),
      ];
    } else {
      const pendingTransfers = await LeadTransferRequest.find({ status: 'Pending' })
        .sort({ requestedAt: -1 })
        .populate('lead', 'organizationName leadNumber')
        .populate('fromAgent', 'fullName username')
        .populate('toAgent', 'fullName username')
        .lean();

      transferAlerts = pendingTransfers.map((t) => ({
        id: `transfer_${t._id}_Pending`,
        type: 'transfer',
        category: 'Pending Transfer',
        title: `Pending Transfer: ${t.lead?.organizationName || t.lead?.leadNumber || 'Lead'}`,
        message: `${t.fromAgent?.fullName || 'Agent'} ➔ ${t.toAgent?.fullName || 'Agent'}`,
        link: `/transfer-requests`,
        severity: 'warning',
        timestamp: t.requestedAt || t.createdAt,
        leadId: t.lead?._id,
        transferId: t._id,
      }));
    }

    // 5. Won or Lost Leads (Outcome marked within last 14 days)
    const outcomeMatch = {
      closureStatus: { $in: ['WON', 'LOST'] },
      $or: [
        { closedAt: { $gte: fourteenDaysAgo } },
        { updatedAt: { $gte: fourteenDaysAgo } },
      ],
    };
    if (!isAdmin) {
      outcomeMatch.$and = [
        {
          $or: [
            { currentOwner: userId },
            { closedBy: userId },
          ],
        },
      ];
    }

    const outcomeLeads = await Lead.find(outcomeMatch)
      .sort({ closedAt: -1, updatedAt: -1 })
      .limit(30)
      .populate('currentOwner', 'fullName username')
      .populate('closedBy', 'fullName username')
      .lean();

    const outcomeAlerts = outcomeLeads.map((l) => {
      const leadName = l.organizationName || l.leadNumber || 'Lead';
      const isWon = l.closureStatus === 'WON';
      const timestamp = l.closedAt || l.updatedAt;
      const formattedValue = l.dealValue ? ` (₹${Number(l.dealValue).toLocaleString('en-IN')})` : '';
      const detail = isWon
        ? `Lead marked Won${formattedValue}${l.closingRemark ? ' • ' + l.closingRemark : ''}`
        : `Lead marked Lost (${l.lostReason || 'Closed'})${l.closingRemark ? ' • ' + l.closingRemark : ''}`;

      return {
        id: `outcome_${l._id}_${l.closureStatus}_${new Date(timestamp).getTime()}`,
        type: isWon ? 'won' : 'lost',
        category: isWon ? 'Lead Won' : 'Lead Lost',
        title: `${isWon ? 'Won' : 'Lost'}: ${leadName}`,
        message: detail,
        link: `/leads/${l._id}`,
        severity: isWon ? 'success' : 'default',
        timestamp,
        leadId: l._id,
        leadName,
        leadNumber: l.leadNumber,
        ownerName: l.currentOwner?.fullName || l.currentOwner?.username,
        closedByName: l.closedBy?.fullName || l.closedBy?.username,
      };
    });

    // Combine all active alerts
    const allAlerts = [
      ...overdueAlerts,
      ...upcomingAlerts,
      ...transferAlerts,
      ...newLeadAlerts,
      ...outcomeAlerts,
    ];

    // Check read status in NotificationRead
    const alertIds = allAlerts.map((a) => a.id);
    const readDocs = alertIds.length
      ? await NotificationRead.find({
          user: userId,
          alertId: { $in: alertIds },
        }).select('alertId readAt').lean()
      : [];

    const readSet = new Set(readDocs.map((r) => r.alertId));

    const enrichedAlerts = allAlerts.map((a) => ({
      ...a,
      isRead: readSet.has(a.id),
    }));

    // Sort: Unread first, then descending by timestamp
    enrichedAlerts.sort((a, b) => {
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    const unreadCount = enrichedAlerts.filter((a) => !a.isRead).length;

    res.json({
      notifications: enrichedAlerts,
      unreadCount,
      counts: {
        total: enrichedAlerts.length,
        unread: unreadCount,
        overdue: overdueAlerts.length,
        upcoming: upcomingAlerts.length,
        transfers: transferAlerts.length,
        newLeads: newLeadAlerts.length,
        wonLost: outcomeAlerts.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'Notification ID is required' });
    }

    await NotificationRead.updateOne(
      { user: req.userId, alertId: id },
      { $setOnInsert: { readAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true, alertId: id });
  } catch (err) {
    next(err);
  }
};

exports.markAllAsRead = async (req, res, next) => {
  try {
    const { alertIds } = req.body;
    if (Array.isArray(alertIds) && alertIds.length > 0) {
      const bulkOps = alertIds.map((alertId) => ({
        updateOne: {
          filter: { user: req.userId, alertId },
          update: { $setOnInsert: { readAt: new Date() } },
          upsert: true,
        },
      }));
      await NotificationRead.bulkWrite(bulkOps);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
