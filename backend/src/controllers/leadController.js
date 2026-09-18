const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const ContactPerson = require('../models/ContactPerson');
const LeadActivity = require('../models/LeadActivity');
const User = require('../models/User');
const CallLog = require('../models/CallLog');
const FollowUp = require('../models/FollowUp');
const LeadTransferRequest = require('../models/LeadTransferRequest');
const Demo = require('../models/Demo');
const WalkIn = require('../models/WalkIn');
const { getNextSequence, formatLeadNumber } = require('../services/counterService');
const { canAccessLead } = require('../utils/leadPermissions');

exports.createLead = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { organizationName, industry, organizationType, address, leadSource, remarks, sourceRemarks, contacts, currentOwner } = req.body;
    if (!organizationName || !leadSource || !contacts || !Array.isArray(contacts) || contacts.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Missing required lead or contact information' });
    }

    // Generate lead number (atomic $inc in counterService prevents duplicates)
    const seq = await getNextSequence('leadNumber');
    const leadNumber = formatLeadNumber(seq);

    // Admin can assign lead to another agent; otherwise assign to self
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    const ownerId = isAdmin && currentOwner ? currentOwner : req.userId;

    const initialOwnerUser = await User.findById(ownerId).session(session);
    const creatorUser = await User.findById(req.userId).session(session);
    const initialOwnerName = initialOwnerUser ? (initialOwnerUser.fullName || initialOwnerUser.username) : 'Agent';
    const creatorName = creatorUser ? (creatorUser.fullName || creatorUser.username) : 'Creator';

    const initialRemark = (remarks !== undefined ? remarks : (sourceRemarks || '')).trim();

    const lead = await Lead.create([{
      leadNumber, organizationName, industry, organizationType, address,
      leadSource,
      remarks: initialRemark,
      sourceRemarks: initialRemark,
      latestRemark: initialRemark || undefined,
      currentOwner: ownerId,
      createdBy: req.userId,
      ownershipHistory: [{
        previousOwner: null,
        previousOwnerName: 'None (Initial Creation)',
        newOwner: ownerId,
        newOwnerName: initialOwnerName,
        transferredBy: req.userId,
        transferredByName: creatorName,
        transferredAt: new Date(),
        remarks: 'Initial lead assignment on creation',
        reason: 'Lead Created',
        isInitial: true,
      }],
    }], { session });

    const leadId = lead[0]._id;

    let primaryContactId = null;
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      const cp = await ContactPerson.create([{
        lead: leadId, name: c.name, designation: c.designation,
        phone: c.phone, altPhone: c.altPhone, email: c.email,
        isPrimary: i === 0, createdBy: req.userId
      }], { session });
      if (i === 0) primaryContactId = cp[0]._id;
    }

    await Lead.findByIdAndUpdate(leadId, { primaryContact: primaryContactId }, { session });

    await LeadActivity.create([{
      lead: leadId, action: 'Lead Created',
      performedBy: req.userId, role: req.userRole,
      metadata: { leadNumber, organizationName, leadSource }
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const created = await Lead.findById(leadId)
      .populate('primaryContact')
      .populate('currentOwner', 'fullName email username')
      .populate('createdBy', 'fullName email username')
      .lean();
    res.status(201).json({ lead: created });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Lead creation error:', err);
    next(err);
  }
};

exports.checkDuplicates = async (req, res, next) => {
  try {
    const { organizationName, contactName, phone } = req.body;
    const matches = [];
    if (organizationName) {
      const orgs = await Lead.find({ organizationName: new RegExp('^' + organizationName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') })
        .limit(5).select('leadNumber organizationName').lean();
      matches.push(...orgs.map(o => ({ type: 'organization', lead: o })));
    }
    if (phone) {
      const escapedPhone = phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cps = await ContactPerson.find({ phone: new RegExp(escapedPhone) })
        .limit(10).populate('lead', 'leadNumber organizationName').lean();
      matches.push(...cps.map(c => ({ type: 'contact', contact: c })));
    }
    if (contactName) {
      const escapedName = contactName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cps2 = await ContactPerson.find({ name: new RegExp(escapedName, 'i') })
        .limit(10).populate('lead', 'leadNumber organizationName').lean();
      matches.push(...cps2.map(c => ({ type: 'contact', contact: c })));
    }
    res.json({ matches });
  } catch (err) {
    next(err);
  }
};

exports.listLeads = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const search = (req.query.search || '').trim();

    const filter = {};
    const ownerParam = req.query.owner || req.query.currentOwner;
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin) {
      const isCallingAgent = (req.agentRole && req.agentRole.toLowerCase().includes('calling')) || (req.user?.agentRole && req.user.agentRole.toLowerCase().includes('calling'));
      if (isCallingAgent) {
        filter.$or = [{ currentOwner: req.userId }, { createdBy: req.userId }];
      } else {
        filter.currentOwner = req.userId;
      }
    } else if (req.query.unassigned === 'true' || ownerParam === 'unassigned') {
      const activeAgents = await User.find({ role: 'AGENT', active: true }).select('_id');
      const activeAgentIds = activeAgents.map((a) => a._id);
      filter.currentOwner = { $nin: activeAgentIds };
    } else if (ownerParam) {
      let targetAgentId = null;
      if (mongoose.Types.ObjectId.isValid(ownerParam)) {
        targetAgentId = new mongoose.Types.ObjectId(ownerParam);
      } else {
        const matchedAgent = await User.findOne({
          role: 'AGENT',
          $or: [
            { fullName: new RegExp(`^${ownerParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            { username: new RegExp(`^${ownerParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            { email: new RegExp(`^${ownerParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          ],
        }).select('_id');
        if (matchedAgent) targetAgentId = matchedAgent._id;
      }
      if (targetAgentId) {
        const targetAgent = await User.findById(targetAgentId).select('agentRole').lean();
        const isCalling = targetAgent?.agentRole?.toLowerCase().includes('calling');
        if (isCalling) {
          filter.$or = [{ currentOwner: targetAgentId }, { createdBy: targetAgentId }];
        } else {
          filter.currentOwner = targetAgentId;
        }
      } else {
        filter.currentOwner = ownerParam;
      }
    }

    // Date filter
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // Closure filter
    if (req.query.closureStatus) {
      filter.closureStatus = req.query.closureStatus;
    }

    // Follow-up filter
    if (req.query.followUpType === 'upcoming') {
      filter.nextFollowUpAt = { $gte: new Date() };
      filter.closureStatus = 'OPEN';
    } else if (req.query.followUpType === 'overdue') {
      filter.nextFollowUpAt = { $lt: new Date(), $gt: new Date(0) };
      filter.closureStatus = 'OPEN';
    }

    // Search logic
    if (search) {
      const isNumeric = /^\d{1,5}$/.test(search);
      if (isNumeric) {
        filter.leadNumber = search.padStart(5, '0');
      } else if (/^[\d+\-()\s]+$/.test(search)) {
        // Search by phone - find contacts with matching phone then get leads
        const contacts = await ContactPerson.find({
          phone: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        }).select('lead').lean();
        const leadIds = [...new Set(contacts.map(c => c.lead.toString()))];
        filter._id = { $in: leadIds };
      } else {
        // Search by organization name or contact person name
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const orgMatch = { organizationName: new RegExp(escapedSearch, 'i') };
        
        // Also find contacts with matching name
        const contacts = await ContactPerson.find({
          name: new RegExp(escapedSearch, 'i')
        }).select('lead').lean();
        const leadIdsFromContacts = [...new Set(contacts.map(c => c.lead.toString()))];
        
        if (leadIdsFromContacts.length > 0) {
          filter.$or = [
            orgMatch,
            { _id: { $in: leadIdsFromContacts } }
          ];
        } else {
          filter.organizationName = new RegExp(escapedSearch, 'i');
        }
      }
    }

    const skip = (page - 1) * limit;
    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip).limit(limit)
        .populate('primaryContact')
        .populate('currentOwner', 'fullName email username')
        .lean(),
      Lead.countDocuments(filter),
    ]);

    res.json({ leads, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};

exports.getLead = async (req, res, next) => {
  try {
    const leadDoc = await Lead.findById(req.params.id)
      .populate('primaryContact')
      .populate('currentOwner', 'fullName email username phone role agentRole')
      .populate('createdBy', 'fullName email username phone role agentRole')
      .populate('closedBy', 'fullName email username phone role agentRole')
      .populate('ownershipHistory.previousOwner', 'fullName email username phone role agentRole')
      .populate('ownershipHistory.newOwner', 'fullName email username phone role agentRole')
      .populate('ownershipHistory.transferredBy', 'fullName email username phone role agentRole');

    if (!leadDoc) return res.status(404).json({ message: 'Lead not found' });
    const hasAccess = await canAccessLead(leadDoc, req.userId, req.userRole, req.agentRole);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Forbidden: You do not have access to this lead' });
    }

    const lead = leadDoc.toObject();

    // If ownershipHistory is empty (e.g. legacy lead), synthesize chain from creator, transfer requests, and current owner
    if (!lead.ownershipHistory || lead.ownershipHistory.length === 0) {
      const chain = [];
      const creatorName = lead.createdBy?.fullName || lead.createdBy?.username || 'Creator';
      chain.push({
        previousOwner: null,
        previousOwnerName: 'None (Initial Creation)',
        newOwner: lead.createdBy || lead.currentOwner,
        newOwnerName: creatorName,
        transferredBy: lead.createdBy,
        transferredByName: creatorName,
        transferredAt: lead.createdAt || new Date(),
        remarks: 'Initial lead assignment on creation',
        reason: 'Lead Created',
        isInitial: true,
      });

      const transferRequests = await LeadTransferRequest.find({ lead: lead._id, status: 'Approved' })
        .sort({ createdAt: 1 })
        .populate('fromAgent', 'fullName email username phone role agentRole')
        .populate('toAgent', 'fullName email username phone role agentRole')
        .lean();

      transferRequests.forEach((tr) => {
        chain.push({
          previousOwner: tr.fromAgent,
          previousOwnerName: tr.fromAgent?.fullName || tr.fromAgent?.username || 'Previous Agent',
          newOwner: tr.toAgent,
          newOwnerName: tr.toAgent?.fullName || tr.toAgent?.username || 'New Agent',
          transferredBy: tr.fromAgent,
          transferredByName: tr.fromAgent?.fullName || tr.fromAgent?.username || 'Agent',
          transferredAt: tr.respondedAt || tr.updatedAt || tr.createdAt,
          remarks: 'Lead transferred',
          reason: 'Ownership transferred',
          isInitial: false,
        });
      });

      lead.ownershipHistory = chain;
    }

    // Simplify owner/creator to just names for frontend
    if (lead.currentOwner && typeof lead.currentOwner === 'object') {
      lead.currentOwnerName = lead.currentOwner.fullName || lead.currentOwner.username || 'Unassigned';
    } else {
      lead.currentOwnerName = 'Unassigned';
    }
    if (lead.createdBy && typeof lead.createdBy === 'object') {
      lead.createdByName = lead.createdBy.fullName || lead.createdBy.username || 'Unknown';
    } else {
      lead.createdByName = 'Unknown';
    }
    res.json({ lead });
  } catch (err) {
    next(err);
  }
};

exports.updateLead = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { organizationName, industry, organizationType, address, leadSource, remarks, sourceRemarks, existingSoftwareUsed, softwareName } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && lead.currentOwner.toString() !== req.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden' });
    }

    const updates = {};
    if (organizationName !== undefined) updates.organizationName = organizationName;
    if (industry !== undefined) updates.industry = industry;
    if (organizationType !== undefined) updates.organizationType = organizationType;
    if (address !== undefined) updates.address = address;
    if (leadSource !== undefined) updates.leadSource = leadSource;
    if (remarks !== undefined) {
      updates.remarks = remarks;
      updates.sourceRemarks = remarks;
      if (!lead.latestRemark) updates.latestRemark = remarks;
    } else if (sourceRemarks !== undefined) {
      updates.remarks = sourceRemarks;
      updates.sourceRemarks = sourceRemarks;
      if (!lead.latestRemark) updates.latestRemark = sourceRemarks;
    }
    if (existingSoftwareUsed !== undefined) updates.existingSoftwareUsed = existingSoftwareUsed;
    if (softwareName !== undefined) updates.softwareName = softwareName;

    if (Object.keys(updates).length > 0) {
      await Lead.findByIdAndUpdate(leadId, updates, { session });
    }

    const metadata = { updates };
    if (req.userRole === 'ADMIN') {
      metadata.adminEdit = true;
    }

    await LeadActivity.create([{
      lead: leadId, action: req.userRole === 'ADMIN' ? 'Admin Edited Lead' : 'Lead Updated',
      performedBy: req.userId, role: req.userRole,
      metadata
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const updated = await Lead.findById(leadId)
      .populate('primaryContact')
      .populate('currentOwner', 'fullName email username')
      .lean();
    res.json({ lead: updated });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.closeWon = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { closingRemark: rawRemark, remark: altRemark, dealValue, product } = req.body;
    const closingRemark = (rawRemark || altRemark || '').trim();

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (lead.closureStatus === 'WON' || lead.closureStatus === 'LOST') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Lead already closed' });
    }

    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    const isOwnerOrCreatorWon = lead.currentOwner?.toString() === req.userId || lead.createdBy?.toString() === req.userId;
    if (!isAdmin && !isOwnerOrCreatorWon) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only set outcome for leads assigned to you or created by you' });
    }

    lead.closureStatus = 'WON';
    lead.status = 'WON';
    lead.closingRemark = closingRemark;
    if (dealValue !== undefined && dealValue !== null && dealValue !== '') lead.dealValue = Number(dealValue) || dealValue;
    if (product && product.trim()) lead.product = product.trim();
    lead.closedBy = req.userId;
    lead.closedAt = new Date();
    lead.nextFollowUpAt = null; // A Won lead must no longer appear as an active/upcoming/overdue follow-up
    await lead.save({ session });

    await LeadActivity.create([{
      lead: leadId, action: 'Lead Closed Won',
      performedBy: req.userId, role: req.userRole,
      metadata: { closingRemark, dealValue, product: product ? product.trim() : undefined }
    }], { session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Lead closed as Won', lead });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.closeLost = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { closingRemark: rawRemark, remark: altRemark, lostReason: rawReason, reason: altReason } = req.body;
    const closingRemark = (rawRemark || altRemark || '').trim();
    const lostReason = (rawReason || altReason || '').trim();

    if (!closingRemark && !lostReason) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'A remark or reason is required when marking a lead as Lost' });
    }

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (lead.closureStatus === 'WON' || lead.closureStatus === 'LOST') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Lead already closed' });
    }

    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    const isOwnerOrCreatorLost = lead.currentOwner?.toString() === req.userId || lead.createdBy?.toString() === req.userId;
    if (!isAdmin && !isOwnerOrCreatorLost) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only set outcome for leads assigned to you or created by you' });
    }

    lead.closureStatus = 'LOST';
    lead.status = 'LOST';
    lead.closingRemark = closingRemark;
    lead.lostReason = lostReason || 'Other';
    lead.closedBy = req.userId;
    lead.closedAt = new Date();
    lead.nextFollowUpAt = null; // A Lost lead must no longer appear as an active/upcoming/overdue follow-up
    await lead.save({ session });

    await LeadActivity.create([{
      lead: leadId, action: 'Lead Closed Lost',
      performedBy: req.userId, role: req.userRole,
      metadata: { closingRemark, lostReason: lead.lostReason }
    }], { session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Lead closed as Lost', lead });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.setOutcome = async (req, res, next) => {
  const outcome = (req.body.outcome || req.body.status || '').toUpperCase();
  if (outcome === 'WON') {
    return exports.closeWon(req, res, next);
  }
  if (outcome === 'LOST') {
    return exports.closeLost(req, res, next);
  }
  return res.status(400).json({ message: 'Invalid outcome: must be WON or LOST' });
};

// ============ CONTACT MANAGEMENT ============

exports.addContact = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { name, designation, phone, altPhone, email, setAsPrimary } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }
    if (req.userRole === 'AGENT' && lead.currentOwner?.toString() !== req.userId && lead.createdBy?.toString() !== req.userId) {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({ message: 'Forbidden' });
    }

    let isPrimary = !!setAsPrimary;
    if (setAsPrimary) {
      await ContactPerson.updateMany({ lead: leadId, isPrimary: true }, { isPrimary: false }, { session });
      isPrimary = true;
    } else {
      // If no primary exists, make this one primary
      const existingPrimary = await ContactPerson.findOne({ lead: leadId, isPrimary: true }).session(session);
      if (!existingPrimary) isPrimary = true;
    }

    const cp = await ContactPerson.create([{
      lead: leadId, name, designation, phone, altPhone, email,
      isPrimary, createdBy: req.userId
    }], { session });

    if (isPrimary) {
      await Lead.findByIdAndUpdate(leadId, { primaryContact: cp[0]._id }, { session });
    }

    await LeadActivity.create([{
      lead: leadId, action: 'Contact Person Added',
      performedBy: req.userId, role: req.userRole,
      metadata: { contactId: cp[0]._id.toString(), name, phone, isPrimary }
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await ContactPerson.findById(cp[0]._id).lean();
    res.status(201).json({ contact: populated });
  } catch (err) {
    await session.abortTransaction(); session.endSession();
    next(err);
  }
};

exports.updateContact = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id: leadId, contactId } = req.params;
    const { name, designation, phone, altPhone, email } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }
    if (req.userRole === 'AGENT' && lead.currentOwner?.toString() !== req.userId && lead.createdBy?.toString() !== req.userId) {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({ message: 'Forbidden' });
    }

    const contact = await ContactPerson.findOne({ _id: contactId, lead: leadId }).session(session);
    if (!contact) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'Contact not found' });
    }

    if (name !== undefined) contact.name = name;
    if (designation !== undefined) contact.designation = designation;
    if (phone !== undefined) contact.phone = phone;
    if (altPhone !== undefined) contact.altPhone = altPhone;
    if (email !== undefined) contact.email = email;
    await contact.save({ session });

    await LeadActivity.create([{
      lead: leadId, action: 'Contact Person Edited',
      performedBy: req.userId, role: req.userRole,
      metadata: { contactId }
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const updated = await ContactPerson.findById(contactId).lean();
    res.json({ contact: updated });
  } catch (err) {
    await session.abortTransaction(); session.endSession();
    next(err);
  }
};

exports.setPrimaryContact = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id: leadId, contactId } = req.params;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }
    if (req.userRole === 'AGENT' && lead.currentOwner?.toString() !== req.userId && lead.createdBy?.toString() !== req.userId) {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({ message: 'Forbidden' });
    }

    const contact = await ContactPerson.findOne({ _id: contactId, lead: leadId }).session(session);
    if (!contact) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'Contact not found' });
    }

    // Unset all primary, set this one
    await ContactPerson.updateMany({ lead: leadId, isPrimary: true }, { isPrimary: false }, { session });
    contact.isPrimary = true;
    await contact.save({ session });

    await Lead.findByIdAndUpdate(leadId, { primaryContact: contactId }, { session });

    const oldPrimaryName = (await ContactPerson.findOne({ lead: leadId, isPrimary: false }).session(session))?.name || 'unknown';

    await LeadActivity.create([{
      lead: leadId, action: 'Primary Contact Changed',
      performedBy: req.userId, role: req.userRole,
      metadata: { newPrimary: contactId, newPrimaryName: contact.name, oldPrimaryName }
    }], { session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Primary contact updated', contact });
  } catch (err) {
    await session.abortTransaction(); session.endSession();
    next(err);
  }
};

exports.listContacts = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    const hasAccess = await canAccessLead(lead, req.userId, req.userRole, req.agentRole);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const contacts = await ContactPerson.find({ lead: leadId }).sort({ isPrimary: -1, createdAt: -1 }).lean();
    res.json({ contacts });
  } catch (err) {
    next(err);
  }
};

exports.rescheduleFollowUp = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { followUpDate, followUpTime, remarks } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Won/Lost leads cannot have an active pending follow-up
    if (lead.closureStatus && lead.closureStatus !== 'OPEN') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Cannot reschedule follow-up for a closed (Won/Lost) lead' });
    }

    // Permissions: Agents can only operate on their own leads; Admins can operate on any lead
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && lead.currentOwner?.toString() !== req.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only reschedule follow-ups for leads assigned to you' });
    }

    if (!followUpDate) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Follow-up date is required' });
    }

    // Parse date and optional time into a Date object
    let scheduledDate;
    if (typeof followUpDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(followUpDate.trim())) {
      const [y, m, d] = followUpDate.trim().split('-').map(Number);
      let hours = 10;
      let minutes = 0;
      if (followUpTime && typeof followUpTime === 'string') {
        const [th, tm] = followUpTime.trim().split(':').map(Number);
        if (!isNaN(th)) hours = th;
        if (!isNaN(tm)) minutes = tm;
      }
      scheduledDate = new Date(y, m - 1, d, hours, minutes, 0, 0);
    } else {
      scheduledDate = new Date(followUpDate);
    }

    if (isNaN(scheduledDate.getTime())) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid follow-up date or time' });
    }

    const previousFollowUpAt = lead.nextFollowUpAt;
    lead.nextFollowUpAt = scheduledDate;

    if (remarks && typeof remarks === 'string' && remarks.trim()) {
      lead.latestRemark = remarks.trim();
    }
    await lead.save({ session });

    // Update existing CallLog in-place if one exists (prevents duplicate follow-ups)
    const existingCallWithFollowUp = await CallLog.findOne({
      lead: leadId,
      followUpAt: { $exists: true, $ne: null },
    }).sort({ calledAt: -1, createdAt: -1 }).session(session);

    if (existingCallWithFollowUp) {
      existingCallWithFollowUp.followUpAt = scheduledDate;
      if (remarks && typeof remarks === 'string' && remarks.trim()) {
        existingCallWithFollowUp.remark = remarks.trim();
      }
      await existingCallWithFollowUp.save({ session });
    }

    // Log activity
    await LeadActivity.create([{
      lead: leadId,
      action: 'Follow-up Rescheduled',
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        previousFollowUpAt,
        newFollowUpAt: scheduledDate,
        remarks: remarks ? remarks.trim() : '',
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await Lead.findById(leadId)
      .populate('currentOwner', 'fullName username email agentRole')
      .populate('createdBy', 'fullName username')
      .populate('primaryContact')
      .lean();

    res.json({
      message: 'Follow-up rescheduled successfully',
      lead: populated,
      nextFollowUpAt: populated.nextFollowUpAt,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.completeFollowUp = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { remarks } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (lead.closureStatus && lead.closureStatus !== 'OPEN') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Cannot complete follow-up for a closed (Won/Lost) lead' });
    }

    if (!lead.nextFollowUpAt) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'No active follow-up to complete' });
    }

    // Permissions: Agents can only operate on their own leads; Admins can operate on any lead
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    if (!isAdmin && lead.currentOwner?.toString() !== req.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only complete follow-ups for leads assigned to you' });
    }

    const previousFollowUpAt = lead.nextFollowUpAt;
    lead.nextFollowUpAt = null;

    if (remarks && typeof remarks === 'string' && remarks.trim()) {
      lead.latestRemark = remarks.trim();
    }
    await lead.save({ session });

    // Log LeadActivity
    await LeadActivity.create([{
      lead: leadId,
      action: 'Follow-up Completed',
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        previousFollowUpAt,
        completedAt: new Date(),
        remarks: remarks ? remarks.trim() : '',
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await Lead.findById(leadId)
      .populate('currentOwner', 'fullName username email agentRole')
      .populate('createdBy', 'fullName username')
      .populate('primaryContact')
      .lean();

    res.json({
      message: 'Follow-up marked as completed',
      lead: populated,
      nextFollowUpAt: null,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.reopenLead = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { remarks } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (lead.closureStatus === 'OPEN') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Lead is already open' });
    }

    const previousStatus = lead.closureStatus;
    lead.closureStatus = 'OPEN';
    lead.status = 'OPEN';
    lead.closedBy = null;
    lead.closedAt = null;
    if (remarks && typeof remarks === 'string' && remarks.trim()) {
      lead.latestRemark = remarks.trim();
    }
    await lead.save({ session });

    await LeadActivity.create([{
      lead: leadId,
      action: 'Lead Re-engaged',
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        previousStatus,
        reopenedAt: new Date(),
        remarks: remarks ? remarks.trim() : 'Lead reopened for re-engagement',
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await Lead.findById(leadId)
      .populate('currentOwner', 'fullName username email agentRole')
      .populate('createdBy', 'fullName username')
      .populate('primaryContact')
      .lean();

    res.json({
      message: 'Lead successfully re-opened for re-engagement',
      lead: populated,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.createSalesFollowUp = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { followUpDate, followUpTime = '10:00', remarks = '', salesAgent: targetSalesAgent, salesAgentId } = req.body;

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
      return res.status(403).json({ message: 'Forbidden: You do not have permission to assign follow-ups for this lead' });
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
    const followUpDateVal = new Date(followUpDate);
    const finalRemarks = (remarks || '').trim();

    const createdFollowUps = await FollowUp.create([{
      lead: leadId,
      salesAgent: assignedSalesAgentId,
      assignedBy: req.userId,
      updatedBy: req.userId,
      followUpDate: followUpDateVal,
      followUpTime: (followUpTime || '10:00').trim(),
      status: 'Planned',
      remarks: finalRemarks,
    }], { session });

    const followUpDoc = createdFollowUps[0];

    // Compute target datetime for nextFollowUpAt
    let targetDateTime = new Date(followUpDateVal);
    if (followUpTime && typeof followUpTime === 'string') {
      const [h, m] = followUpTime.split(':').map(Number);
      targetDateTime.setHours(h || 10, m || 0, 0, 0);
    }
    lead.nextFollowUpAt = targetDateTime;

    // Update latestSalesFollowUp on lead
    lead.latestSalesFollowUp = {
      followUpId: followUpDoc._id,
      followUpDate: followUpDateVal,
      followUpTime: (followUpTime || '10:00').trim(),
      status: 'Planned',
      remarks: finalRemarks,
      salesAgent: assignedSalesAgentId,
      salesAgentName,
      assignedBy: req.userId,
      assignedByName,
      scheduledAt: new Date(),
      updatedAt: new Date(),
    };
    await lead.save({ session });

    // Activity log entry
    await LeadActivity.create([{
      lead: leadId,
      action: 'Sales Follow-up Scheduled',
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        followUpId: followUpDoc._id.toString(),
        followUpDate: followUpDateVal,
        followUpTime: (followUpTime || '10:00').trim(),
        remarks: finalRemarks,
        salesAgentId: assignedSalesAgentId.toString(),
        salesAgentName,
        assignedByName,
        activityType: 'Sales Follow-up',
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await FollowUp.findById(followUpDoc._id)
      .populate('salesAgent', 'fullName email username agentRole phone')
      .populate('assignedBy', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    res.status(201).json({ followUp: populated, latestSalesFollowUp: lead.latestSalesFollowUp });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.updateSalesFollowUpStatus = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id: leadId, followUpId } = req.params;
    const { status, remarks, followUpDate, followUpTime } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    const followUp = await FollowUp.findOne({ _id: followUpId, lead: leadId }).session(session);
    if (!followUp) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Sales follow-up record not found' });
    }

    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    const isOwner = lead.currentOwner?.toString() === req.userId;
    const isAssignedSalesAgent = followUp.salesAgent?.toString() === req.userId;
    if (!isAdmin && !isOwner && !isAssignedSalesAgent) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only update follow-ups assigned to you or your leads' });
    }

    const targetStatus = (status || 'Completed').trim();
    const finalRemarks = (remarks !== undefined ? remarks : followUp.remarks).trim();

    if (['Done', 'Completed', 'Not Done'].includes(targetStatus) && !finalRemarks) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Remarks are required when completing or marking not done' });
    }

    const updaterName = req.user?.fullName || req.user?.username || 'Agent';
    followUp.status = targetStatus;
    followUp.remarks = finalRemarks;
    if (followUpDate) followUp.followUpDate = new Date(followUpDate);
    if (followUpTime) followUp.followUpTime = followUpTime.trim();
    followUp.updatedBy = req.userId;
    await followUp.save({ session });

    if (['Done', 'Completed'].includes(targetStatus)) {
      lead.nextFollowUpAt = null;
    }

    // Update latestSalesFollowUp on lead
    lead.latestSalesFollowUp = {
      followUpId: followUp._id,
      followUpDate: followUp.followUpDate,
      followUpTime: followUp.followUpTime,
      status: followUp.status,
      remarks: followUp.remarks,
      salesAgent: followUp.salesAgent,
      salesAgentName: lead.latestSalesFollowUp?.salesAgentName || updaterName,
      assignedBy: followUp.assignedBy || lead.latestSalesFollowUp?.assignedBy,
      assignedByName: lead.latestSalesFollowUp?.assignedByName || updaterName,
      scheduledAt: lead.latestSalesFollowUp?.scheduledAt || followUp.createdAt,
      updatedAt: new Date(),
    };
    await lead.save({ session });

    // Activity log entry
    await LeadActivity.create([{
      lead: leadId,
      action: 'Follow-up Completed',
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        followUpId: followUp._id.toString(),
        status: followUp.status,
        remarks: followUp.remarks,
        updatedByName: updaterName,
        activityType: 'Sales Follow-up',
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await FollowUp.findById(followUp._id)
      .populate('salesAgent', 'fullName email username agentRole phone')
      .populate('assignedBy', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    res.json({ followUp: populated, latestSalesFollowUp: lead.latestSalesFollowUp });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.listSalesFollowUps = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const followUps = await FollowUp.find({ lead: leadId })
      .sort({ followUpDate: -1, createdAt: -1 })
      .populate('salesAgent', 'fullName email username agentRole phone')
      .populate('assignedBy', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    res.json({ followUps });
  } catch (err) {
    next(err);
  }
};

exports.transferLead = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { toAgentId, remarks, reason } = req.body;
    if (!toAgentId) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ message: 'New active agent (toAgentId) is required' });
    }

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (lead.closureStatus && lead.closureStatus !== 'OPEN') {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ message: 'Cannot transfer a closed lead' });
    }

    const toAgent = await User.findById(toAgentId).session(session);
    if (!toAgent || !toAgent.active) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ message: 'Destination agent not found or is inactive' });
    }

    const oldOwnerId = lead.currentOwner;
    const oldOwner = oldOwnerId ? await User.findById(oldOwnerId).session(session) : null;
    const fromName = oldOwner ? (oldOwner.fullName || oldOwner.username) : 'Unassigned';
    const toName = toAgent.fullName || toAgent.username;
    const transferRemarks = (remarks || reason || '').trim() || 'Ownership transferred to new active agent';
    const transferDetails = `Transferred from ${fromName} to ${toName}${remarks || reason ? ` — Reason/Remarks: ${transferRemarks}` : ''}`;

    // Update current owner immediately
    lead.currentOwner = toAgent._id;

    // Ensure ownershipHistory exists and contains initial owner if empty
    if (!Array.isArray(lead.ownershipHistory) || lead.ownershipHistory.length === 0) {
      const creator = lead.createdBy ? await User.findById(lead.createdBy).session(session) : null;
      lead.ownershipHistory = [{
        previousOwner: null,
        previousOwnerName: 'None (Initial Creation)',
        newOwner: oldOwnerId || lead.createdBy,
        newOwnerName: fromName,
        transferredBy: lead.createdBy || req.userId,
        transferredByName: creator ? (creator.fullName || creator.username) : 'Creator',
        transferredAt: lead.createdAt || new Date(),
        remarks: 'Initial lead assignment',
        reason: 'Lead Created',
        isInitial: true,
      }];
    }

    // Append this transfer step to the chronological chain
    lead.ownershipHistory.push({
      previousOwner: oldOwnerId,
      previousOwnerName: fromName,
      newOwner: toAgent._id,
      newOwnerName: toName,
      transferredBy: req.userId,
      transferredByName: req.user ? (req.user.fullName || req.user.username) : 'System',
      transferredAt: new Date(),
      remarks: transferRemarks,
      reason: transferRemarks,
      isInitial: false,
    });

    await lead.save({ session });

    // Cancel or approve any existing pending transfer requests for this lead
    await LeadTransferRequest.updateMany(
      { lead: leadId, status: 'Pending' },
      { status: 'Approved', respondedAt: new Date() },
      { session }
    );

    // Create completed transfer request record for audit trail
    const transferReq = await LeadTransferRequest.create([{
      lead: lead._id,
      fromAgent: oldOwnerId || req.userId,
      toAgent: toAgent._id,
      status: 'Approved',
      requestedAt: new Date(),
      respondedAt: new Date(),
    }], { session });

    // Save transfer in the existing activity/history system (LeadActivity)
    await LeadActivity.create([
      {
        lead: lead._id,
        action: 'Lead Transferred',
        performedBy: req.userId,
        role: req.userRole,
        details: transferDetails,
        metadata: {
          requestId: transferReq[0]._id,
          from: oldOwnerId,
          to: toAgent._id,
          newOwner: toAgent._id,
          remarks: transferRemarks,
          reason: transferRemarks,
        },
      },
      {
        lead: lead._id,
        action: 'Ownership Changed',
        performedBy: req.userId,
        role: req.userRole,
        details: transferDetails,
        metadata: {
          newOwner: toAgent._id,
          previousOwner: oldOwnerId,
          remarks: transferRemarks,
          reason: transferRemarks,
        },
      },
    ], { session });

    await session.commitTransaction();
    session.endSession();

    const populatedLead = await Lead.findById(lead._id)
      .populate('currentOwner', 'fullName username email phone role agentRole')
      .populate('createdBy', 'fullName username role agentRole')
      .populate('primaryContact')
      .populate('ownershipHistory.previousOwner', 'fullName username email phone role agentRole')
      .populate('ownershipHistory.newOwner', 'fullName username email phone role agentRole')
      .populate('ownershipHistory.transferredBy', 'fullName email username phone role agentRole');

    res.json({
      message: 'Lead transferred successfully',
      lead: populatedLead,
      transfer: transferReq[0],
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.deleteLead = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role === 'ADMIN' || (req.user?.agentRole && req.user.agentRole.toLowerCase() === 'admin');
    if (!isAdmin) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: Only administrators can delete leads' });
    }

    const { id } = req.params;
    const lead = await Lead.findById(id).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Cascade delete all child records related to this specific lead
    await ContactPerson.deleteMany({ lead: id }, { session });
    await LeadActivity.deleteMany({ lead: id }, { session });
    await CallLog.deleteMany({ lead: id }, { session });
    await Demo.deleteMany({ lead: id }, { session });
    await WalkIn.deleteMany({ lead: id }, { session });
    await FollowUp.deleteMany({ lead: id }, { session });
    await LeadTransferRequest.deleteMany({ lead: id }, { session });
    await Lead.deleteOne({ _id: id }, { session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: 'Lead and associated records deleted successfully',
      leadId: id,
      organizationName: lead.organizationName,
      leadNumber: lead.leadNumber
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};
