const mongoose = require('mongoose');
const XLSX = require('xlsx');
const Lead = require('../models/Lead');
const User = require('../models/User');
const ContactPerson = require('../models/ContactPerson');
const CallLog = require('../models/CallLog');
const FollowUp = require('../models/FollowUp');
const Demo = require('../models/Demo');
const WalkIn = require('../models/WalkIn');
const LeadTransferRequest = require('../models/LeadTransferRequest');
const LeadActivity = require('../models/LeadActivity');

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().replace('T', ' ').substring(0, 19);
}

function formatDateOnly(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().substring(0, 10);
}

function sanitizeCell(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (/^[=+\-@]/.test(s)) {
    return `'${s}`;
  }
  return s;
}

function parseAddress(addrStr) {
  if (!addrStr || typeof addrStr !== 'string') return { address: '', city: '', state: '' };
  const clean = addrStr.trim().replace(/\r?\n/g, ' ');
  const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
  let city = '';
  let state = '';
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];
    const secondLast = parts[parts.length - 2];
    const stateMatch = lastPart.replace(/\d{5,6}/g, '').trim();
    state = stateMatch || lastPart;
    city = secondLast;
  } else if (parts.length === 1) {
    city = parts[0];
  }
  return { address: clean, city, state };
}

function toCsv(rows) {
  if (!rows || rows.length === 0) return '\uFEFF';
  const headers = Object.keys(rows[0]);
  const escapeCell = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };
  const headerLine = headers.map(escapeCell).join(',');
  const lines = rows.map((r) => headers.map((h) => escapeCell(r[h])).join(','));
  return '\uFEFF' + [headerLine, ...lines].join('\r\n');
}

async function buildLeadFilter(query, scope) {
  if (scope === 'all') {
    return {};
  }

  const filter = {};
  const ownerParam = query.owner || query.currentOwner;

  if (query.unassigned === 'true' || ownerParam === 'unassigned') {
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
      filter.currentOwner = targetAgentId;
    } else {
      filter.currentOwner = ownerParam;
    }
  }

  // Date filter
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  // Closure status filter
  if (query.closureStatus) {
    filter.closureStatus = query.closureStatus;
  }

  // Follow-up type filter
  if (query.followUpType === 'upcoming') {
    filter.nextFollowUpAt = { $gte: new Date() };
    filter.closureStatus = 'OPEN';
  } else if (query.followUpType === 'overdue') {
    filter.nextFollowUpAt = { $lt: new Date(), $gt: new Date(0) };
    filter.closureStatus = 'OPEN';
  }

  // Search logic
  const search = (query.search || '').trim();
  if (search) {
    const isNumeric = /^\d{1,5}$/.test(search);
    if (isNumeric) {
      filter.leadNumber = search.padStart(5, '0');
    } else if (/^[\d+\-()\s]+$/.test(search)) {
      const contacts = await ContactPerson.find({
        phone: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      }).select('lead').lean();
      const leadIds = [...new Set(contacts.map((c) => c.lead.toString()))];
      filter._id = { $in: leadIds };
    } else {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const orgMatch = { organizationName: new RegExp(escapedSearch, 'i') };
      const contacts = await ContactPerson.find({
        name: new RegExp(escapedSearch, 'i'),
      }).select('lead').lean();
      const leadIdsFromContacts = [...new Set(contacts.map((c) => c.lead.toString()))];

      if (leadIdsFromContacts.length > 0) {
        filter.$or = [orgMatch, { _id: { $in: leadIdsFromContacts } }];
      } else {
        filter.organizationName = new RegExp(escapedSearch, 'i');
      }
    }
  }

  return filter;
}

exports.bulkTransfer = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { fromAgentId, toAgentId, leadIds } = req.body;
    if (!fromAgentId || !toAgentId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'fromAgentId and toAgentId are required' });
    }

    const fromAgent = await User.findById(fromAgentId);
    const toAgent = await User.findById(toAgentId);
    if (!fromAgent || fromAgent.role !== 'AGENT') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid source agent' });
    }
    if (!toAgent || toAgent.role !== 'AGENT') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid destination agent' });
    }

    const fromAgentObjId = new mongoose.Types.ObjectId(fromAgentId);
    const toAgentObjId = new mongoose.Types.ObjectId(toAgentId);

    const filter = { currentOwner: fromAgentObjId };
    if (Array.isArray(leadIds) && leadIds.length > 0) filter._id = { $in: leadIds };

    const leads = await Lead.find(filter).session(session);
    if (!leads.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'No leads found for transfer' });
    }

    const leadIdsTransferred = [];
    for (const l of leads) {
      l.currentOwner = toAgentObjId;
      await l.save({ session });
      leadIdsTransferred.push(l._id);
      await LeadActivity.create([{ lead: l._id, action: 'Admin Bulk Transfer', performedBy: req.userId, role: req.userRole, metadata: { fromAgentId, toAgentId } }], { session });
    }

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Bulk transfer completed', count: leadIdsTransferred.length, leadIds: leadIdsTransferred });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.exportRawDump = async (req, res, next) => {
  try {
    const format = (req.query.format || 'xlsx').toLowerCase().trim();
    const scope = (req.query.scope || 'all').toLowerCase().trim();

    const filter = await buildLeadFilter(req.query, scope);

    // Fetch all matching leads without pagination
    const leads = await Lead.find(filter)
      .sort({ leadNumber: 1 })
      .populate('primaryContact')
      .populate('currentOwner', 'fullName email username phone role agentRole')
      .populate('createdBy', 'fullName email username phone role agentRole')
      .populate('closedBy', 'fullName email username phone role agentRole')
      .lean();

    const leadIds = leads.map((l) => l._id);

    // Fetch all related entities in parallel
    const [allCalls, allFollowUps, allDemos, allWalkIns, allTransfers] = await Promise.all([
      CallLog.find({ lead: { $in: leadIds } })
        .sort({ calledAt: -1, createdAt: -1 })
        .populate('user', 'fullName email username')
        .populate('calledContact', 'name phone designation')
        .lean(),
      FollowUp.find({ $or: [{ lead: { $in: leadIds } }, { leadId: { $in: leadIds } }] })
        .sort({ followUpDate: -1, createdAt: -1 })
        .populate('salesAgent assignedBy updatedBy', 'fullName email username')
        .lean(),
      Demo.find({ lead: { $in: leadIds } })
        .sort({ demoDate: -1, createdAt: -1 })
        .populate('salesAgent assignedBy updatedBy', 'fullName email username')
        .lean(),
      WalkIn.find({ lead: { $in: leadIds } })
        .sort({ walkInDate: -1, createdAt: -1 })
        .populate('salesAgent assignedBy updatedBy', 'fullName email username')
        .lean(),
      LeadTransferRequest.find({ lead: { $in: leadIds } })
        .sort({ createdAt: -1 })
        .populate('fromAgent toAgent', 'fullName email username')
        .lean(),
    ]);

    // Map related records by lead ID for fast lookup
    const callsByLead = new Map();
    allCalls.forEach((c) => {
      const k = c.lead ? c.lead.toString() : '';
      if (k) {
        if (!callsByLead.has(k)) callsByLead.set(k, []);
        callsByLead.get(k).push(c);
      }
    });

    const followUpsByLead = new Map();
    allFollowUps.forEach((f) => {
      const k = (f.lead || f.leadId)?.toString();
      if (k) {
        if (!followUpsByLead.has(k)) followUpsByLead.set(k, []);
        followUpsByLead.get(k).push(f);
      }
    });

    const demosByLead = new Map();
    allDemos.forEach((d) => {
      const k = d.lead?.toString();
      if (k) {
        if (!demosByLead.has(k)) demosByLead.set(k, []);
        demosByLead.get(k).push(d);
      }
    });

    const walkInsByLead = new Map();
    allWalkIns.forEach((w) => {
      const k = w.lead?.toString();
      if (k) {
        if (!walkInsByLead.has(k)) walkInsByLead.set(k, []);
        walkInsByLead.get(k).push(w);
      }
    });

    const transfersByLead = new Map();
    allTransfers.forEach((t) => {
      const k = t.lead?.toString();
      if (k) {
        if (!transfersByLead.has(k)) transfersByLead.set(k, []);
        transfersByLead.get(k).push(t);
      }
    });

    // Build Master Leads rows (1 row per lead, strictly no duplicates)
    const masterRows = leads.map((l) => {
      const lid = l._id.toString();
      const lCalls = callsByLead.get(lid) || [];
      const lFollowUps = followUpsByLead.get(lid) || [];
      const lDemos = demosByLead.get(lid) || [];
      const lWalkIns = walkInsByLead.get(lid) || [];
      const lTransfers = transfersByLead.get(lid) || [];

      const lastCall = lCalls[0];
      const latestFollowUp = lFollowUps[0];
      const latestDemo = lDemos[0];
      const latestWalkIn = lWalkIns[0];

      const contactPhone = l.primaryContact?.phone || '';
      const contactEmail = l.primaryContact?.email || '';
      const contactName = l.primaryContact?.name || '';
      const contactDesignation = l.primaryContact?.designation || '';

      const addrParsed = parseAddress(l.address);

      // Next follow-up details
      let nextFollowUpDate = l.nextFollowUpAt ? formatDate(l.nextFollowUpAt) : '';
      let nextFollowUpStatus = '';
      let nextFollowUpRemarks = '';
      let nextFollowUpOwner = '';
      if (l.latestSalesFollowUp && l.latestSalesFollowUp.followUpDate) {
        if (!nextFollowUpDate) {
          nextFollowUpDate = `${formatDateOnly(l.latestSalesFollowUp.followUpDate)} ${l.latestSalesFollowUp.followUpTime || ''}`.trim();
        }
        nextFollowUpStatus = l.latestSalesFollowUp.status || '';
        nextFollowUpRemarks = l.latestSalesFollowUp.remarks || '';
        nextFollowUpOwner = l.latestSalesFollowUp.salesAgentName || '';
      } else if (latestFollowUp) {
        if (!nextFollowUpDate) {
          const fDate = latestFollowUp.followUpDate || latestFollowUp.followupDate;
          const fTime = latestFollowUp.followUpTime || latestFollowUp.followupTime || '';
          nextFollowUpDate = `${formatDateOnly(fDate)} ${fTime}`.trim();
        }
        nextFollowUpStatus = latestFollowUp.status || '';
        nextFollowUpRemarks = latestFollowUp.remarks || latestFollowUp.notes || '';
        nextFollowUpOwner = latestFollowUp.salesAgent?.fullName || latestFollowUp.agentName || latestFollowUp.salesAgent?.username || '';
      }

      // Demo details
      let demoSchedule = '';
      let demoStatus = '';
      let demoRemarks = '';
      let demoAgent = '';
      if (l.latestDemo && l.latestDemo.demoDate) {
        demoSchedule = `${formatDateOnly(l.latestDemo.demoDate)} ${l.latestDemo.demoTime || ''}`.trim();
        demoStatus = l.latestDemo.status || '';
        demoRemarks = l.latestDemo.remarks || '';
        demoAgent = l.latestDemo.salesAgentName || '';
      } else if (latestDemo) {
        demoSchedule = `${formatDateOnly(latestDemo.demoDate)} ${latestDemo.demoTime || ''}`.trim();
        demoStatus = latestDemo.status || '';
        demoRemarks = latestDemo.remarks || '';
        demoAgent = latestDemo.salesAgent?.fullName || latestDemo.salesAgent?.username || '';
      }

      // Walk-in details
      let walkInSchedule = '';
      let walkInStatus = '';
      let walkInRemarks = '';
      let walkInAgent = '';
      if (l.latestWalkIn && l.latestWalkIn.walkInDate) {
        walkInSchedule = `${formatDateOnly(l.latestWalkIn.walkInDate)} ${l.latestWalkIn.walkInTime || ''}`.trim();
        walkInStatus = l.latestWalkIn.status || '';
        walkInRemarks = l.latestWalkIn.remark || '';
        walkInAgent = l.latestWalkIn.salesAgentName || '';
      } else if (latestWalkIn) {
        walkInSchedule = `${formatDateOnly(latestWalkIn.walkInDate)} ${latestWalkIn.walkInTime || ''}`.trim();
        walkInStatus = latestWalkIn.status || '';
        walkInRemarks = latestWalkIn.remark || '';
        walkInAgent = latestWalkIn.salesAgent?.fullName || latestWalkIn.salesAgent?.username || '';
      }

      // Ownership and Transfer details
      let originalOwner = l.createdBy?.fullName || l.createdBy?.username || '';
      if (l.ownershipHistory && l.ownershipHistory.length > 0) {
        const initialEntry = l.ownershipHistory.find((h) => h.isInitial) || l.ownershipHistory[0];
        if (initialEntry?.newOwnerName) originalOwner = initialEntry.newOwnerName;
        else if (initialEntry?.previousOwnerName && initialEntry.previousOwnerName !== 'None (Initial Creation)') {
          originalOwner = initialEntry.previousOwnerName;
        }
      }

      const totalTransfers = (l.ownershipHistory?.length ? l.ownershipHistory.length - 1 : 0) + lTransfers.length;

      // Transfer summary string
      let transferSummary = 'No Transfers';
      if (l.ownershipHistory && l.ownershipHistory.length > 1) {
        const chain = l.ownershipHistory.map((h) => h.newOwnerName || 'Unknown');
        transferSummary = chain.join(' -> ');
      } else if (lTransfers.length > 0) {
        transferSummary = lTransfers.map((t) => `${t.fromAgent?.fullName || 'Agent'} -> ${t.toAgent?.fullName || 'Agent'} (${t.status})`).join('; ');
      }

      return {
        'Lead ID': sanitizeCell(l._id.toString()),
        'Lead Number': sanitizeCell(l.leadNumber || ''),
        'Hospital Name': sanitizeCell(l.organizationName || ''),
        'Hospital Phone Number': sanitizeCell(contactPhone),
        'Hospital Email': sanitizeCell(contactEmail),
        'Primary Contact Person': sanitizeCell(contactName),
        'Contact Designation': sanitizeCell(contactDesignation),
        'Address': sanitizeCell(addrParsed.address),
        'City': sanitizeCell(l.city || addrParsed.city),
        'State': sanitizeCell(l.state || addrParsed.state),
        'Lead Source': sanitizeCell(l.leadSource || ''),
        'Created Date': sanitizeCell(formatDate(l.createdAt)),
        'Last Updated Date': sanitizeCell(formatDate(l.updatedAt)),
        'Created By': sanitizeCell(l.createdBy?.fullName || l.createdBy?.username || ''),
        'Verified Hospital Coordinates': (l.hospitalCoordinates?.latitude != null && l.hospitalCoordinates?.longitude != null) ? `${l.hospitalCoordinates.latitude.toFixed(6)}, ${l.hospitalCoordinates.longitude.toFixed(6)}` : 'Not recorded',
        'Lead Creation Location Status': sanitizeCell(l.createdLocation?.status || 'Not recorded'),
        'Lead Creation Coordinates': (l.createdLocation?.latitude !== null && l.createdLocation?.latitude !== undefined && l.createdLocation?.longitude !== null && l.createdLocation?.longitude !== undefined) ? `${l.createdLocation.latitude.toFixed(6)}, ${l.createdLocation.longitude.toFixed(6)}` : 'Not recorded',
        'Lead Creation GPS Accuracy': (l.createdLocation?.accuracy !== null && l.createdLocation?.accuracy !== undefined) ? `±${l.createdLocation.accuracy}m` : 'Not recorded',
        'Lead Creation Distance from Hospital': l.createdLocation?.distanceMetres != null ? `${l.createdLocation.distanceMetres}m` : 'N/A',
        'Lead Creation Geofence Result': sanitizeCell(l.createdLocation?.geofenceStatus || 'Not Verified'),
        'Lead Creation Device Name': sanitizeCell(l.createdDeviceName || 'Not recorded'),
        'Lead Creation Device ID': sanitizeCell(l.createdDeviceInstallationId || 'Not recorded'),
        'Lead Creation Google Maps Link': (l.createdLocation?.latitude !== null && l.createdLocation?.latitude !== undefined && l.createdLocation?.longitude !== null && l.createdLocation?.longitude !== undefined) ? `https://www.google.com/maps?q=${l.createdLocation.latitude},${l.createdLocation.longitude}` : 'Not recorded',
        'Current Assigned Agent': sanitizeCell(l.currentOwner?.fullName || l.currentOwner?.username || ''),
        'Current Lead Status': sanitizeCell(l.closureStatus || l.status || 'OPEN'),
        'Priority': sanitizeCell(l.priority || 'Normal'),
        'Latest Remarks': sanitizeCell(l.latestRemark || l.remarks || ''),
        'Initial Remarks': sanitizeCell(l.remarks || l.sourceRemarks || ''),
        'Total Calls': lCalls.length,
        'Last Call Date and Time': sanitizeCell(formatDate(l.lastCalledAt || lastCall?.calledAt)),
        'Last Call Disposition': sanitizeCell(l.latestDisposition || lastCall?.disposition || ''),
        'Latest Call Remarks': sanitizeCell(lastCall?.remark || l.latestRemark || ''),
        'Calling Agent': sanitizeCell(lastCall?.user?.fullName || lastCall?.user?.username || ''),
        'Next Follow-up Date and Time': sanitizeCell(nextFollowUpDate),
        'Follow-up Status': sanitizeCell(nextFollowUpStatus),
        'Follow-up Remarks': sanitizeCell(nextFollowUpRemarks),
        'Follow-up Owner': sanitizeCell(nextFollowUpOwner),
        'Demo Scheduled Date and Time': sanitizeCell(demoSchedule),
        'Demo Status': sanitizeCell(demoStatus),
        'Demo Remarks': sanitizeCell(demoRemarks),
        'Demo Agent': sanitizeCell(demoAgent),
        'Walk-in Scheduled Date and Time': sanitizeCell(walkInSchedule),
        'Walk-in Status': sanitizeCell(walkInStatus),
        'Walk-in Remarks': sanitizeCell(walkInRemarks),
        'Walk-in Agent': sanitizeCell(walkInAgent),
        'Original Lead Owner': sanitizeCell(originalOwner),
        'Current Lead Owner': sanitizeCell(l.currentOwner?.fullName || l.currentOwner?.username || ''),
        'Transfer Summary': sanitizeCell(transferSummary),
        'Total Transfers': Math.max(0, totalTransfers),
        'Deal Value': l.dealValue !== undefined && l.dealValue !== null ? l.dealValue : '',
        'Product': sanitizeCell(l.product || ''),
        'Lost Reason': sanitizeCell(l.lostReason || ''),
        'Closing Remark': sanitizeCell(l.closingRemark || ''),
        'Closed By': sanitizeCell(l.closedBy?.fullName || l.closedBy?.username || ''),
        'Closed Date': sanitizeCell(formatDate(l.closedAt)),
      };
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const scopeLabel = scope === 'filtered' ? 'filtered' : 'all';

    // If CSV format requested
    if (format === 'csv') {
      const csvData = toCsv(masterRows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="telecrm_leads_raw_dump_${scopeLabel}_${timestamp}.csv"`);
      return res.status(200).send(csvData);
    }

    // Default: Multi-sheet Excel workbook
    const leadMap = new Map();
    leads.forEach((l) => leadMap.set(l._id.toString(), l));

    // Sheet 2: Call History
    const callRows = allCalls.map((c) => {
      const p = leadMap.get(c.lead ? c.lead.toString() : '');
      return {
        'Lead Number': sanitizeCell(p?.leadNumber || ''),
        'Lead ID': sanitizeCell(c.lead?.toString() || ''),
        'Hospital Name': sanitizeCell(p?.organizationName || ''),
        'Call Date and Time': sanitizeCell(formatDate(c.calledAt || c.createdAt)),
        'Calling Agent': sanitizeCell(c.user?.fullName || c.user?.username || ''),
        'Contact Person Called': sanitizeCell(c.calledContact?.name || ''),
        'Contact Designation': sanitizeCell(c.calledContact?.designation || ''),
        'Contact Phone': sanitizeCell(c.calledContact?.phone || ''),
        'Call Disposition': sanitizeCell(c.disposition || ''),
        'Call Remarks': sanitizeCell(c.remark || ''),
        'Follow-up Date Scheduled': sanitizeCell(formatDate(c.followUpAt)),
      };
    });

    // Sheet 3: Follow-ups
    const followUpRows = allFollowUps.map((f) => {
      const lid = (f.lead || f.leadId)?.toString();
      const p = leadMap.get(lid);
      const fDate = f.followUpDate || f.followupDate;
      const fTime = f.followUpTime || f.followupTime || '';
      return {
        'Lead Number': sanitizeCell(p?.leadNumber || ''),
        'Lead ID': sanitizeCell(lid || ''),
        'Hospital Name': sanitizeCell(p?.organizationName || ''),
        'Follow-up Date': sanitizeCell(formatDateOnly(fDate)),
        'Follow-up Time': sanitizeCell(fTime),
        'Status': sanitizeCell(f.status || 'Planned'),
        'Assigned Agent': sanitizeCell(f.salesAgent?.fullName || f.agentName || f.salesAgent?.username || ''),
        'Assigned By': sanitizeCell(f.assignedBy?.fullName || f.assignedBy?.username || ''),
        'Remarks': sanitizeCell(f.remarks || f.notes || ''),
        'Created Date': sanitizeCell(formatDate(f.createdAt)),
        'Last Updated': sanitizeCell(formatDate(f.updatedAt)),
      };
    });

    // Sheet 4: Demos
    const demoRows = allDemos.map((d) => {
      const lid = d.lead?.toString();
      const p = leadMap.get(lid);
      return {
        'Lead Number': sanitizeCell(p?.leadNumber || ''),
        'Lead ID': sanitizeCell(lid || ''),
        'Hospital Name': sanitizeCell(p?.organizationName || ''),
        'Demo Date': sanitizeCell(formatDateOnly(d.demoDate)),
        'Demo Time': sanitizeCell(d.demoTime || ''),
        'Status': sanitizeCell(d.status || 'Planned'),
        'Sales Agent': sanitizeCell(d.salesAgent?.fullName || d.salesAgent?.username || ''),
        'Assigned By': sanitizeCell(d.assignedBy?.fullName || d.assignedBy?.username || ''),
        'Remarks': sanitizeCell(d.remarks || ''),
        'Created Date': sanitizeCell(formatDate(d.createdAt)),
        'Last Updated': sanitizeCell(formatDate(d.updatedAt)),
      };
    });

    // Sheet 5: Walk-ins
    const walkInRows = allWalkIns.map((w) => {
      const lid = w.lead?.toString();
      const p = leadMap.get(lid);
      return {
        'Lead Number': sanitizeCell(p?.leadNumber || ''),
        'Lead ID': sanitizeCell(lid || ''),
        'Hospital Name': sanitizeCell(p?.organizationName || ''),
        'Walk-in Date': sanitizeCell(formatDateOnly(w.walkInDate)),
        'Walk-in Time': sanitizeCell(w.walkInTime || ''),
        'Status': sanitizeCell(w.status || 'Planned'),
        'Sales Agent': sanitizeCell(w.salesAgent?.fullName || w.salesAgent?.username || ''),
        'Assigned By': sanitizeCell(w.assignedBy?.fullName || w.assignedBy?.username || ''),
        'Remarks': sanitizeCell(w.remark || ''),
        'Created Date': sanitizeCell(formatDate(w.createdAt)),
        'Last Updated': sanitizeCell(formatDate(w.updatedAt)),
      };
    });

    // Sheet 6: Transfer History
    const transferRows = [];
    leads.forEach((l) => {
      if (l.ownershipHistory && l.ownershipHistory.length > 0) {
        l.ownershipHistory.forEach((h) => {
          transferRows.push({
            'Lead Number': sanitizeCell(l.leadNumber || ''),
            'Lead ID': sanitizeCell(l._id.toString()),
            'Hospital Name': sanitizeCell(l.organizationName || ''),
            'Transfer Date': sanitizeCell(formatDate(h.transferredAt)),
            'Transferred By': sanitizeCell(h.transferredByName || ''),
            'Previous Owner': sanitizeCell(h.previousOwnerName || 'None (Initial Creation)'),
            'New Owner': sanitizeCell(h.newOwnerName || ''),
            'Reason': sanitizeCell(h.reason || (h.isInitial ? 'Initial Assignment' : 'Direct Reassignment')),
            'Remarks': sanitizeCell(h.remarks || ''),
            'Transfer Type': h.isInitial ? 'Initial Creation' : 'Direct Transfer',
          });
        });
      }
      const reqs = transfersByLead.get(l._id.toString()) || [];
      reqs.forEach((tr) => {
        transferRows.push({
          'Lead Number': sanitizeCell(l.leadNumber || ''),
          'Lead ID': sanitizeCell(l._id.toString()),
          'Hospital Name': sanitizeCell(l.organizationName || ''),
          'Transfer Date': sanitizeCell(formatDate(tr.respondedAt || tr.requestedAt || tr.createdAt)),
          'Transferred By': sanitizeCell(tr.fromAgent?.fullName || tr.fromAgent?.username || ''),
          'Previous Owner': sanitizeCell(tr.fromAgent?.fullName || tr.fromAgent?.username || ''),
          'New Owner': sanitizeCell(tr.toAgent?.fullName || tr.toAgent?.username || ''),
          'Reason': `Transfer Request (${tr.status})`,
          'Remarks': `Status: ${tr.status}`,
          'Transfer Type': 'Transfer Request',
        });
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(masterRows.length ? masterRows : [{ Note: 'No matching leads found' }]), 'Leads');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(callRows.length ? callRows : [{ Note: 'No call history records' }]), 'Call History');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(followUpRows.length ? followUpRows : [{ Note: 'No follow-up records' }]), 'Follow-ups');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(demoRows.length ? demoRows : [{ Note: 'No demo records' }]), 'Demos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(walkInRows.length ? walkInRows : [{ Note: 'No walk-in records' }]), 'Walk-ins');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transferRows.length ? transferRows : [{ Note: 'No transfer history records' }]), 'Transfer History');

    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="telecrm_raw_dump_${scopeLabel}_${timestamp}.xlsx"`);
    res.setHeader('Content-Length', excelBuffer.length);
    return res.status(200).send(excelBuffer);
  } catch (err) {
    console.error('Export raw dump error:', err);
    next(err);
  }
};
