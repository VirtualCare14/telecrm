const Demo = require('../models/Demo');
const WalkIn = require('../models/WalkIn');
const FollowUp = require('../models/FollowUp');
const LeadTransferRequest = require('../models/LeadTransferRequest');
const LeadActivity = require('../models/LeadActivity');

/**
 * Check if the user is authorized to read/view a lead and its activities.
 * Returns true if Admin, Current Owner, Creator, Previous Owner, or assigned Sales Agent on any Demo, WalkIn, or Sales Follow-up.
 */
async function canAccessLead(lead, userId, userRole, agentRole) {
  if (!lead) return false;
  const isAdmin = userRole === 'ADMIN' || (agentRole && agentRole.toLowerCase() === 'admin');
  if (isAdmin) return true;

  const uId = userId?.toString();
  if (!uId) return false;

  const ownerId = lead.currentOwner?._id ? lead.currentOwner._id.toString() : lead.currentOwner?.toString();
  if (ownerId && ownerId === uId) return true;

  // Creator retains read access
  const creatorId = lead.createdBy?._id ? lead.createdBy._id.toString() : lead.createdBy?.toString();
  if (creatorId && creatorId === uId) return true;

  // Previous owners in ownershipHistory retain historical access
  if (Array.isArray(lead.ownershipHistory)) {
    const wasInHistory = lead.ownershipHistory.some((h) => {
      const prev = (h.previousOwner?._id || h.previousOwner)?.toString();
      const next = (h.newOwner?._id || h.newOwner)?.toString();
      const by = (h.transferredBy?._id || h.transferredBy)?.toString();
      return prev === uId || next === uId || by === uId;
    });
    if (wasInHistory) return true;
  }

  // Previous owners in transfer requests retain access
  const wasInTransfer = await LeadTransferRequest.exists({
    lead: lead._id,
    $or: [{ fromAgent: userId }, { toAgent: userId }]
  });
  if (wasInTransfer) return true;

  // Users who logged previous activities retain access to review history
  const didActivity = await LeadActivity.exists({ lead: lead._id, performedBy: userId });
  if (didActivity) return true;

  // Check if assigned on latest activities
  if (lead.latestDemo?.salesAgent?.toString() === uId) return true;
  if (lead.latestWalkIn?.salesAgent?.toString() === uId) return true;
  if (lead.latestSalesFollowUp?.salesAgent?.toString() === uId) return true;

  // Check if user is assigned as salesAgent on any Demo, WalkIn, or FollowUp for this lead
  const hasDemo = await Demo.exists({ lead: lead._id, salesAgent: userId });
  if (hasDemo) return true;

  const hasWalkIn = await WalkIn.exists({ lead: lead._id, salesAgent: userId });
  if (hasWalkIn) return true;

  const hasFollowUp = await FollowUp.exists({ lead: lead._id, salesAgent: userId });
  if (hasFollowUp) return true;

  return false;
}

module.exports = { canAccessLead };
