const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
const { classifyLead } = require('../utils/leadScoring');
const { calculateHaversineDistance } = require('../utils/geoUtils');
const { parseFollowUpDateTimeIST } = require('../utils/timeZoneHelper');

exports.createLead = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { organizationName, industry, organizationType, address, leadSource, remarks, sourceRemarks, contacts, currentOwner, leadTemperature, temperature } = req.body;
    if (!organizationName || !leadSource) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Missing required lead information (organizationName and leadSource are required)' });
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

    let initialTemperature = null;
    const rawTemp = leadTemperature !== undefined ? leadTemperature : temperature;
    if (rawTemp && typeof rawTemp === 'string' && rawTemp.trim()) {
      const t = rawTemp.trim().toLowerCase();
      if (t === 'hot') initialTemperature = 'Hot';
      else if (t === 'warm') initialTemperature = 'Warm';
      else if (t === 'cold') initialTemperature = 'Cold';
    }

    // Parse and sanitize initial Lead Creation Location & Device metadata
    let createdLocation = {
      latitude: null,
      longitude: null,
      accuracy: null,
      capturedAt: null,
      status: 'Not Requested',
    };

    const locSource = (req.body.createdLocation && typeof req.body.createdLocation === 'object') ? req.body.createdLocation : req.body;
    const rawStatus = locSource.status || req.body.locationStatus;
    const allowedStatuses = ['Captured', 'Permission Denied', 'Unavailable', 'Timed Out', 'Not Requested'];

    if (rawStatus && allowedStatuses.includes(rawStatus)) {
      createdLocation.status = rawStatus;
    } else if (locSource.latitude !== undefined && locSource.latitude !== null && locSource.longitude !== undefined && locSource.longitude !== null) {
      createdLocation.status = 'Captured';
    }

    if (locSource.latitude !== undefined && locSource.latitude !== null && locSource.latitude !== '') {
      const lat = Number(locSource.latitude);
      if (!Number.isNaN(lat) && lat >= -90 && lat <= 90) {
        createdLocation.latitude = lat;
      }
    }

    if (locSource.longitude !== undefined && locSource.longitude !== null && locSource.longitude !== '') {
      const lng = Number(locSource.longitude);
      if (!Number.isNaN(lng) && lng >= -180 && lng <= 180) {
        createdLocation.longitude = lng;
      }
    }

    if (locSource.accuracy !== undefined && locSource.accuracy !== null && locSource.accuracy !== '') {
      const acc = Number(locSource.accuracy);
      if (!Number.isNaN(acc) && acc >= 0) {
        createdLocation.accuracy = Math.round(acc * 10) / 10;
      }
    }

    const rawCapTime = locSource.capturedAt || locSource.locationCapturedAt || req.body.locationCapturedAt;
    if (rawCapTime) {
      const parsedTime = new Date(rawCapTime);
      if (!Number.isNaN(parsedTime.getTime())) {
        createdLocation.capturedAt = parsedTime;
      }
    } else if (createdLocation.status === 'Captured') {
      createdLocation.capturedAt = new Date();
    }

    const rawDeviceId = req.body.createdDeviceInstallationId || req.body.deviceInstallationId || locSource.deviceInstallationId;
    const createdDeviceInstallationId = typeof rawDeviceId === 'string' && rawDeviceId.trim() ? rawDeviceId.trim().substring(0, 128) : null;

    const rawDeviceName = req.body.createdDeviceName || req.body.deviceName || locSource.deviceName;
    const createdDeviceName = typeof rawDeviceName === 'string' && rawDeviceName.trim() ? rawDeviceName.trim().substring(0, 128) : null;

    // Hospital Coordinates Extraction & Verification
    let hospCoords = null;
    const rawHosp = (req.body.hospitalCoordinates && typeof req.body.hospitalCoordinates === 'object') ? req.body.hospitalCoordinates : {};
    const rawHospLat = rawHosp.latitude !== undefined && rawHosp.latitude !== null && rawHosp.latitude !== '' 
      ? rawHosp.latitude 
      : (req.body.hospitalLatitude !== undefined && req.body.hospitalLatitude !== null && req.body.hospitalLatitude !== '' ? req.body.hospitalLatitude : null);
    const rawHospLng = rawHosp.longitude !== undefined && rawHosp.longitude !== null && rawHosp.longitude !== '' 
      ? rawHosp.longitude 
      : (req.body.hospitalLongitude !== undefined && req.body.hospitalLongitude !== null && req.body.hospitalLongitude !== '' ? req.body.hospitalLongitude : null);

    if (rawHospLat != null && rawHospLng != null) {
      const nHLat = Number(rawHospLat);
      const nHLng = Number(rawHospLng);
      if (!Number.isNaN(nHLat) && nHLat >= -90 && nHLat <= 90 && !Number.isNaN(nHLng) && nHLng >= -180 && nHLng <= 180) {
        hospCoords = {
          latitude: nHLat,
          longitude: nHLng,
          isVerified: rawHosp.isVerified !== undefined ? Boolean(rawHosp.isVerified) : true,
          verifiedAt: new Date(),
          verifiedBy: req.userId,
          source: rawHosp.source || 'Lead Entry',
        };
      }
    }

    // If not supplied directly, check if existing verified coordinates exist for this hospital/organizationName
    if (!hospCoords && organizationName) {
      const existingVerified = await Lead.findOne({
        organizationName: new RegExp('^' + organizationName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
        'hospitalCoordinates.isVerified': true,
        'hospitalCoordinates.latitude': { $ne: null },
        'hospitalCoordinates.longitude': { $ne: null },
      }).session(session);

      if (existingVerified?.hospitalCoordinates?.isVerified) {
        hospCoords = {
          latitude: existingVerified.hospitalCoordinates.latitude,
          longitude: existingVerified.hospitalCoordinates.longitude,
          isVerified: true,
          verifiedAt: existingVerified.hospitalCoordinates.verifiedAt || new Date(),
          verifiedBy: existingVerified.hospitalCoordinates.verifiedBy || req.userId,
          source: 'Verified Hospital Registry',
        };
      }
    }

    // Role check: Sales Agent on-site restriction vs Calling Agent remote access
    const userAgentRole = (req.agentRole || req.user?.agentRole || creatorUser?.agentRole || '').toLowerCase();
    const isSalesAgent = (req.userRole === 'AGENT' || req.user?.role?.toUpperCase() === 'AGENT') &&
      userAgentRole.includes('sales');

    // 1. Mandatory Live Camera Photo Validation for Sales Agent (Role-Specific)
    let savedVisitPhoto = null;
    const photoPayload = req.body.visitPhoto || req.body.photo;
    let photoData = typeof photoPayload === 'string' ? photoPayload : photoPayload?.data;

    if (isSalesAgent) {
      if (!photoData || typeof photoData !== 'string' || !photoData.startsWith('data:image/')) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: 'Mandatory live camera photo is required for Sales Agent lead creation. Please capture a live photo before submitting.',
        });
      }
    }

    if (photoData && typeof photoData === 'string' && photoData.startsWith('data:image/')) {
      const matches = photoData.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        if (isSalesAgent) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: 'Invalid photo data format. Please capture a valid camera photo.',
          });
        }
      } else {
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');

        if (buffer.length < 500) {
          if (isSalesAgent) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              message: 'Captured photo is invalid or empty. Please capture a clear camera photo.',
            });
          }
        } else if (buffer.length > 10 * 1024 * 1024) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: 'Captured photo exceeds the 10MB size limit. Please retake the photo.',
          });
        } else {
          const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
          const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
          const isWebp = buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP';

          if (!isJpeg && !isPng && !isWebp) {
            if (isSalesAgent) {
              await session.abortTransaction();
              session.endSession();
              return res.status(400).json({
                message: 'Uploaded file is not a valid image format. Please capture using the camera.',
              });
            }
          } else {
            const extension = isJpeg ? 'jpg' : isPng ? 'png' : 'webp';
            const uploadDir = path.join(__dirname, '../../uploads/leads');
            if (!fs.existsSync(uploadDir)) {
              fs.mkdirSync(uploadDir, { recursive: true });
            }
            const filename = `lead-photo-${leadNumber}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;
            const filePath = path.join(uploadDir, filename);
            fs.writeFileSync(filePath, buffer);

            savedVisitPhoto = {
              url: `/uploads/leads/${filename}`,
              filename,
              contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
              sizeBytes: buffer.length,
              capturedAt: photoPayload?.capturedAt ? new Date(photoPayload.capturedAt) : new Date(),
              capturedBy: req.userId,
              capturedByName: creatorName,
              deviceInstallationId: createdDeviceInstallationId || photoPayload?.deviceInstallationId || null,
            };
          }
        }
      }
    }

    // 2. Location is completely OPTIONAL (never block submission for missing/inaccurate GPS)
    if (createdLocation.latitude != null && createdLocation.longitude != null && hospCoords?.latitude != null && hospCoords?.longitude != null) {
      const distance = calculateHaversineDistance(
        createdLocation.latitude,
        createdLocation.longitude,
        hospCoords.latitude,
        hospCoords.longitude
      );
      createdLocation.distanceMetres = distance;
      if (distance !== null && distance <= 150 && (createdLocation.accuracy == null || createdLocation.accuracy <= 90)) {
        createdLocation.geofenceStatus = 'Passed';
        createdLocation.geofenceReason = `Within 150m radius (${Math.round(distance)}m) with accuracy ±${Math.round(createdLocation.accuracy || 0)}m`;
      } else if (distance !== null && distance > 150) {
        createdLocation.geofenceStatus = 'Failed';
        createdLocation.geofenceReason = `Distance (${Math.round(distance)}m) exceeded 150m radius`;
      } else if (createdLocation.accuracy != null && createdLocation.accuracy > 90) {
        createdLocation.geofenceStatus = 'Failed';
        createdLocation.geofenceReason = `GPS accuracy (±${Math.round(createdLocation.accuracy)}m) exceeded 90m threshold`;
      } else {
        createdLocation.geofenceStatus = 'Not Verified';
      }
    } else if (isSalesAgent) {
      createdLocation.geofenceStatus = 'Not Verified';
      createdLocation.geofenceReason = createdLocation.status === 'Permission Denied'
        ? 'Location permission denied - visit recorded without geofence verification'
        : 'Location optional - visit recorded without geofence verification';
    } else {
      createdLocation.geofenceStatus = 'Exempt';
      createdLocation.geofenceReason = 'Calling Agent / Admin remote access exemption';
    }

    const lead = await Lead.create([{
      leadNumber, organizationName, industry, organizationType, address,
      leadSource,
      remarks: initialRemark,
      sourceRemarks: initialRemark,
      latestRemark: initialRemark || undefined,
      currentOwner: ownerId,
      createdBy: req.userId,
      updatedBy: req.userId,
      updatedByName: creatorName,
      leadTemperature: initialTemperature,
      temperatureUpdatedBy: initialTemperature ? req.userId : null,
      temperatureUpdatedByName: initialTemperature ? creatorName : null,
      temperatureUpdatedAt: initialTemperature ? new Date() : null,
      temperatureHistory: initialTemperature ? [{
        temperature: initialTemperature,
        previousTemperature: null,
        changedBy: req.userId,
        changedByName: creatorName,
        changedAt: new Date(),
        source: 'Create Lead',
        remark: initialRemark || 'Initial classification on lead creation',
      }] : [],
      hospitalCoordinates: hospCoords || undefined,
      createdLocation,
      createdDeviceInstallationId,
      createdDeviceName,
      visitPhoto: savedVisitPhoto || undefined,
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
    if (contacts && Array.isArray(contacts) && contacts.length > 0) {
      for (let i = 0; i < contacts.length; i++) {
        const c = contacts[i];
        if (!c || (!c.name && !c.phone)) continue;
        const cp = await ContactPerson.create([{
          lead: leadId, name: c.name || 'Primary Contact', designation: c.designation,
          phone: c.phone || '—', altPhone: c.altPhone, email: c.email,
          isPrimary: i === 0, createdBy: req.userId
        }], { session });
        if (i === 0) primaryContactId = cp[0]._id;
      }
    }

    if (primaryContactId) {
      await Lead.findByIdAndUpdate(leadId, { primaryContact: primaryContactId }, { session });
    }

    await LeadActivity.create([{
      lead: leadId, action: 'Lead Created',
      performedBy: req.userId, role: req.userRole,
      metadata: {
        leadNumber,
        organizationName,
        leadSource,
        leadTemperature: initialTemperature,
        hospitalCoordinates: hospCoords,
        createdLocation,
        createdDeviceInstallationId,
        createdDeviceName,
      }
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
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    if (session) {
      session.endSession();
    }
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

    const conditions = [];
    const ownerParam = req.query.owner || req.query.currentOwner;
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');

    if (!isAdmin) {
      // Agents (Calling Agents & Sales Agents) can see leads they currently own, originally created,
      // or have assigned/scheduled activities on (demos, walk-ins, follow-ups)
      const [demoLeadIds, walkInLeadIds, followUpLeadIds, activityLeadIds] = await Promise.all([
        Demo.distinct('lead', { $or: [{ salesAgent: req.userId }, { assignedBy: req.userId }] }),
        WalkIn.distinct('lead', { $or: [{ salesAgent: req.userId }, { assignedBy: req.userId }] }),
        FollowUp.distinct('lead', { $or: [{ salesAgent: req.userId }, { assignedBy: req.userId }] }),
        LeadActivity.distinct('lead', { performedBy: req.userId }),
      ]);
      const associatedLeadIds = [
        ...new Set([
          ...demoLeadIds.map((id) => id.toString()),
          ...walkInLeadIds.map((id) => id.toString()),
          ...followUpLeadIds.map((id) => id.toString()),
          ...activityLeadIds.map((id) => id.toString()),
        ])
      ];

      conditions.push({
        $or: [
          { currentOwner: req.userId },
          { createdBy: req.userId },
          { _id: { $in: associatedLeadIds } },
          { 'latestDemo.salesAgent': req.userId },
          { 'latestWalkIn.salesAgent': req.userId },
          { 'latestSalesFollowUp.salesAgent': req.userId },
          { 'latestDemo.assignedBy': req.userId },
          { 'latestWalkIn.assignedBy': req.userId },
          { 'latestSalesFollowUp.assignedBy': req.userId },
        ]
      });
    } else if (req.query.unassigned === 'true' || ownerParam === 'unassigned') {
      const activeAgents = await User.find({ role: 'AGENT', active: true }).select('_id');
      const activeAgentIds = activeAgents.map((a) => a._id);
      conditions.push({ currentOwner: { $nin: activeAgentIds } });
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
        const [demoLeadIds, walkInLeadIds, followUpLeadIds] = await Promise.all([
          Demo.distinct('lead', { $or: [{ salesAgent: targetAgentId }, { assignedBy: targetAgentId }] }),
          WalkIn.distinct('lead', { $or: [{ salesAgent: targetAgentId }, { assignedBy: targetAgentId }] }),
          FollowUp.distinct('lead', { $or: [{ salesAgent: targetAgentId }, { assignedBy: targetAgentId }] }),
        ]);
        const associatedLeadIds = [
          ...new Set([
            ...demoLeadIds.map((id) => id.toString()),
            ...walkInLeadIds.map((id) => id.toString()),
            ...followUpLeadIds.map((id) => id.toString()),
          ])
        ];
        conditions.push({
          $or: [
            { currentOwner: targetAgentId },
            { createdBy: targetAgentId },
            { _id: { $in: associatedLeadIds } },
            { 'latestDemo.salesAgent': targetAgentId },
            { 'latestWalkIn.salesAgent': targetAgentId },
            { 'latestSalesFollowUp.salesAgent': targetAgentId },
          ]
        });
      } else {
        conditions.push({ currentOwner: ownerParam });
      }
    }

    // Date filter
    if (req.query.startDate || req.query.endDate) {
      const dateCond = {};
      if (req.query.startDate) dateCond.$gte = new Date(req.query.startDate);
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        dateCond.$lte = end;
      }
      conditions.push({ createdAt: dateCond });
    }

    // Closure filter
    if (req.query.closureStatus) {
      conditions.push({ closureStatus: req.query.closureStatus });
    }

    // Follow-up filter
    if (req.query.followUpType === 'upcoming') {
      conditions.push({ nextFollowUpAt: { $gte: new Date() }, closureStatus: 'OPEN' });
    } else if (req.query.followUpType === 'overdue') {
      conditions.push({ nextFollowUpAt: { $lt: new Date(), $gt: new Date(0) }, closureStatus: 'OPEN' });
    } else if (req.query.followUpType === 'today') {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const [ty, tm, td] = todayStr.split('-').map(Number);
      const startToday = new Date(Date.UTC(ty, tm - 1, td, 0, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000);
      const endToday = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999) - (5 * 60 + 30) * 60 * 1000);
      conditions.push({ nextFollowUpAt: { $gte: startToday, $lte: endToday }, closureStatus: 'OPEN' });
    }

    // Disposition filter
    if (req.query.latestDisposition || req.query.disposition) {
      const disp = req.query.latestDisposition || req.query.disposition;
      conditions.push({ latestDisposition: disp });
    }

    // Temperature filter integrated directly into backend MongoDB conditions
    const temperatureParam = (req.query.temperature || req.query.leadTemperature || '').trim();
    if (temperatureParam && temperatureParam.toLowerCase() !== 'all') {
      const norm = temperatureParam.toLowerCase();
      if (norm === 'hot') {
        conditions.push({ leadTemperature: { $in: ['Hot', 'hot', 'HOT'] } });
      } else if (norm === 'warm') {
        conditions.push({ leadTemperature: { $in: ['Warm', 'warm', 'WARM'] } });
      } else if (norm === 'cold') {
        conditions.push({ leadTemperature: { $in: ['Cold', 'cold', 'COLD'] } });
      } else if (norm === 'unclassified') {
        conditions.push({
          $or: [
            { leadTemperature: null },
            { leadTemperature: { $exists: false } },
            { leadTemperature: '' },
          ]
        });
      }
    }

    // Search logic
    if (search) {
      const isNumeric = /^\d{1,5}$/.test(search);
      if (isNumeric) {
        conditions.push({ leadNumber: search.padStart(5, '0') });
      } else if (/^[\d+\-()\s]+$/.test(search)) {
        // Search by phone - find contacts with matching phone then get leads
        const contacts = await ContactPerson.find({
          phone: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        }).select('lead').lean();
        const leadIds = [...new Set(contacts.map(c => c.lead.toString()))];
        conditions.push({ _id: { $in: leadIds } });
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
          conditions.push({
            $or: [
              orgMatch,
              { _id: { $in: leadIdsFromContacts } }
            ]
          });
        } else {
          conditions.push(orgMatch);
        }
      }
    }

    const filter = conditions.length > 0 ? { $and: conditions } : {};

    const skip = (page - 1) * limit;
    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip).limit(limit)
        .populate('primaryContact')
        .populate('currentOwner', 'fullName email username')
        .lean(),
      Lead.countDocuments(filter),
    ]);

    const classifiedLeads = leads.map((lead) => {
      const dynamicClass = classifyLead(lead);
      const effectiveTemp = lead.leadTemperature
        ? (lead.leadTemperature.charAt(0).toUpperCase() + lead.leadTemperature.slice(1).toLowerCase())
        : dynamicClass.temperature;
      let badge = dynamicClass.badge;
      if (lead.leadTemperature) {
        if (effectiveTemp === 'Hot') {
          badge = { label: 'Hot', color: '#b91c1c', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)' };
        } else if (effectiveTemp === 'Warm') {
          badge = { label: 'Warm', color: '#c2410c', bg: 'rgba(234, 88, 12, 0.12)', border: 'rgba(234, 88, 12, 0.3)' };
        } else if (effectiveTemp === 'Cold') {
          badge = { label: 'Cold', color: '#0369a1', bg: 'rgba(2, 132, 199, 0.12)', border: 'rgba(2, 132, 199, 0.3)' };
        }
      }
      return {
        ...lead,
        classification: {
          ...dynamicClass,
          classification: effectiveTemp || dynamicClass.classification,
          temperature: effectiveTemp,
          badge,
        },
        temperature: effectiveTemp,
        leadTemperature: effectiveTemp,
        leadScore: dynamicClass.score,
      };
    });

    res.json({ leads: classifiedLeads, page, limit, total, totalPages: Math.ceil(total / limit) });
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
      .populate('updatedBy', 'fullName email username phone role agentRole')
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
    if (lead.updatedBy && typeof lead.updatedBy === 'object') {
      lead.updatedByName = lead.updatedBy.fullName || lead.updatedBy.username || lead.updatedByName || lead.createdByName || 'Unknown';
    } else if (lead.updatedByName) {
      lead.updatedByName = lead.updatedByName;
    } else {
      lead.updatedByName = lead.createdByName || 'Unknown';
    }

    // Attach dynamic lead classification with saved DB leadTemperature priority
    const dynamicClass = classifyLead(lead);
    const effectiveTemp = lead.leadTemperature
      ? (lead.leadTemperature.charAt(0).toUpperCase() + lead.leadTemperature.slice(1).toLowerCase())
      : dynamicClass.temperature;
    let badge = dynamicClass.badge;
    if (lead.leadTemperature) {
      if (effectiveTemp === 'Hot') {
        badge = { label: 'Hot', color: '#b91c1c', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)' };
      } else if (effectiveTemp === 'Warm') {
        badge = { label: 'Warm', color: '#c2410c', bg: 'rgba(234, 88, 12, 0.12)', border: 'rgba(234, 88, 12, 0.3)' };
      } else if (effectiveTemp === 'Cold') {
        badge = { label: 'Cold', color: '#0369a1', bg: 'rgba(2, 132, 199, 0.12)', border: 'rgba(2, 132, 199, 0.3)' };
      }
    }
    lead.classification = {
      ...dynamicClass,
      classification: effectiveTemp || dynamicClass.classification,
      temperature: effectiveTemp,
      badge,
    };
    lead.temperature = effectiveTemp;
    lead.leadTemperature = effectiveTemp;
    lead.leadScore = dynamicClass.score;

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
    const { organizationName, industry, organizationType, address, leadSource, remarks, sourceRemarks, existingSoftwareUsed, softwareName, leadTemperature, temperature, disposition } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }
    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    const hasAccess = await canAccessLead(lead, req.userId, req.userRole, req.agentRole);
    if (!isAdmin && !hasAccess) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You do not have permission to update this lead' });
    }

    const updaterName = req.user?.fullName || req.user?.username || 'Agent';
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

    const rawTemp = leadTemperature !== undefined ? leadTemperature : temperature;
    if (rawTemp) {
      const normalizedTemp = rawTemp.trim().charAt(0).toUpperCase() + rawTemp.trim().slice(1).toLowerCase();
      updates.leadTemperature = normalizedTemp;
      updates.temperatureUpdatedBy = req.userId;
      updates.temperatureUpdatedByName = updaterName;
      updates.temperatureUpdatedAt = new Date();
    }
    if (disposition !== undefined && disposition) {
      const cleanDisp = disposition.trim();
      updates.disposition = cleanDisp;
      updates.latestDisposition = cleanDisp;
      updates.dispositionUpdatedBy = req.userId;
      updates.dispositionUpdatedByName = updaterName;
      updates.dispositionUpdatedAt = new Date();
    }

    // Support updating verified hospital coordinates
    const rawHosp = (req.body.hospitalCoordinates && typeof req.body.hospitalCoordinates === 'object') ? req.body.hospitalCoordinates : {};
    const rawHospLat = rawHosp.latitude !== undefined && rawHosp.latitude !== null && rawHosp.latitude !== '' 
      ? rawHosp.latitude 
      : (req.body.hospitalLatitude !== undefined && req.body.hospitalLatitude !== null && req.body.hospitalLatitude !== '' ? req.body.hospitalLatitude : undefined);
    const rawHospLng = rawHosp.longitude !== undefined && rawHosp.longitude !== null && rawHosp.longitude !== '' 
      ? rawHosp.longitude 
      : (req.body.hospitalLongitude !== undefined && req.body.hospitalLongitude !== null && req.body.hospitalLongitude !== '' ? req.body.hospitalLongitude : undefined);

    if (rawHospLat !== undefined || rawHospLng !== undefined || rawHosp.isVerified !== undefined) {
      const currentHosp = lead.hospitalCoordinates || {};
      const newLat = rawHospLat !== undefined ? (rawHospLat !== null && rawHospLat !== '' ? Number(rawHospLat) : null) : currentHosp.latitude;
      const newLng = rawHospLng !== undefined ? (rawHospLng !== null && rawHospLng !== '' ? Number(rawHospLng) : null) : currentHosp.longitude;
      const isVerified = rawHosp.isVerified !== undefined ? Boolean(rawHosp.isVerified) : (newLat != null && newLng != null ? true : false);

      updates.hospitalCoordinates = {
        latitude: newLat,
        longitude: newLng,
        isVerified,
        verifiedAt: new Date(),
        verifiedBy: req.userId,
        source: rawHosp.source || (isAdmin ? 'Admin Verified' : 'Updated'),
      };
    }

    const previousValues = {};
    for (const key of Object.keys(updates)) {
      previousValues[key] = lead[key];
    }

    updates.updatedBy = req.userId;
    updates.updatedByName = updaterName;

    if (Object.keys(updates).length > 0) {
      await Lead.findByIdAndUpdate(leadId, updates, { session });
    }

    const metadata = { updates, previousValues, updatedByName: updaterName };
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
    const hasAccess = await canAccessLead(lead, req.userId, req.userRole, req.agentRole);
    if (!isAdmin && !hasAccess) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only set outcome for leads assigned to you or created by you' });
    }

    const updaterName = req.user?.fullName || req.user?.username || 'Agent';
    lead.closureStatus = 'WON';
    lead.status = 'WON';
    lead.closingRemark = closingRemark;
    if (dealValue !== undefined && dealValue !== null && dealValue !== '') lead.dealValue = Number(dealValue) || dealValue;
    if (product && product.trim()) lead.product = product.trim();
    lead.closedBy = req.userId;
    lead.closedAt = new Date();
    lead.updatedBy = req.userId;
    lead.updatedByName = updaterName;
    lead.nextFollowUpAt = null; // A Won lead must no longer appear as an active/upcoming/overdue follow-up
    await lead.save({ session });

    await LeadActivity.create([{
      lead: leadId, action: 'Lead Closed Won',
      performedBy: req.userId, role: req.userRole,
      metadata: { closingRemark, dealValue, product: product ? product.trim() : undefined, updatedByName: updaterName }
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
    const hasAccess = await canAccessLead(lead, req.userId, req.userRole, req.agentRole);
    if (!isAdmin && !hasAccess) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only set outcome for leads assigned to you or created by you' });
    }

    const updaterName = req.user?.fullName || req.user?.username || 'Agent';
    lead.closureStatus = 'LOST';
    lead.status = 'LOST';
    lead.closingRemark = closingRemark;
    lead.lostReason = lostReason || 'Other';
    lead.closedBy = req.userId;
    lead.closedAt = new Date();
    lead.updatedBy = req.userId;
    lead.updatedByName = updaterName;
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
    const hasAccess = await canAccessLead(lead, req.userId, req.userRole, req.agentRole);
    if (req.userRole === 'AGENT' && !hasAccess) {
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
      lead.primaryContact = cp[0]._id;
    }
    lead.updatedBy = req.userId;
    lead.updatedByName = req.user?.fullName || req.user?.username || 'Agent';
    await lead.save({ session });

    await LeadActivity.create([{
      lead: leadId, action: 'Contact Person Added',
      performedBy: req.userId, role: req.userRole,
      metadata: { contactId: cp[0]._id.toString(), name, phone, isPrimary, updatedByName: lead.updatedByName }
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
    const hasAccess = await canAccessLead(lead, req.userId, req.userRole, req.agentRole);
    if (req.userRole === 'AGENT' && !hasAccess) {
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

    lead.updatedBy = req.userId;
    lead.updatedByName = req.user?.fullName || req.user?.username || 'Agent';
    await lead.save({ session });

    await LeadActivity.create([{
      lead: leadId, action: 'Contact Person Edited',
      performedBy: req.userId, role: req.userRole,
      metadata: { contactId, updatedByName: lead.updatedByName }
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
    const hasAccess = await canAccessLead(lead, req.userId, req.userRole, req.agentRole);
    if (req.userRole === 'AGENT' && !hasAccess) {
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

    lead.primaryContact = contactId;
    lead.updatedBy = req.userId;
    lead.updatedByName = req.user?.fullName || req.user?.username || 'Agent';
    await lead.save({ session });

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
    const hasAccess = await canAccessLead(lead, req.userId, req.userRole, req.agentRole);
    if (!isAdmin && !hasAccess) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only reschedule follow-ups for leads assigned to you' });
    }

    if (!followUpDate) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Follow-up date is required' });
    }

    // Parse date and optional time strictly in Asia/Kolkata timezone (+05:30)
    const scheduledDate = parseFollowUpDateTimeIST(followUpDate, followUpTime);
    if (!scheduledDate || isNaN(scheduledDate.getTime())) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid follow-up date or time' });
    }

    const updaterName = req.user?.fullName || req.user?.username || 'Agent';
    const previousFollowUpAt = lead.nextFollowUpAt;
    lead.nextFollowUpAt = scheduledDate;

    if (remarks && typeof remarks === 'string' && remarks.trim()) {
      lead.latestRemark = remarks.trim();
    }
    lead.updatedBy = req.userId;
    lead.updatedByName = updaterName;
    await lead.save({ session });

    // Update existing CallLog in-place if one exists (prevents duplicate follow-ups)
    const existingCallWithFollowUp = await CallLog.findOne({
      lead: leadId,
      followUpAt: { $exists: true, $ne: null },
    }).sort({ calledAt: -1, createdAt: -1 }).session(session);

    if (existingCallWithFollowUp) {
      existingCallWithFollowUp.followUpAt = scheduledDate;
      // Do NOT overwrite existingCallWithFollowUp.remark to preserve original call history!
      await existingCallWithFollowUp.save({ session });
    }

    const actionName = previousFollowUpAt ? 'Follow-up Rescheduled' : 'Follow-up Scheduled';

    // Log activity
    await LeadActivity.create([{
      lead: leadId,
      action: actionName,
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        previousFollowUpAt,
        newFollowUpAt: scheduledDate,
        remarks: remarks ? remarks.trim() : '',
        updatedByName: updaterName,
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
    const hasAccess = await canAccessLead(lead, req.userId, req.userRole, req.agentRole);
    if (!isAdmin && !hasAccess) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only complete follow-ups for leads assigned to you' });
    }

    const updaterName = req.user?.fullName || req.user?.username || 'Agent';
    const previousFollowUpAt = lead.nextFollowUpAt;
    lead.nextFollowUpAt = null;

    if (remarks && typeof remarks === 'string' && remarks.trim()) {
      lead.latestRemark = remarks.trim();
    }
    lead.updatedBy = req.userId;
    lead.updatedByName = updaterName;
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
        updatedByName: updaterName,
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
    const followUpDateVal = parseFollowUpDateTimeIST(followUpDate, followUpTime || '10:00') || new Date(followUpDate);
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

    // target datetime for nextFollowUpAt (in Asia/Kolkata timezone)
    lead.nextFollowUpAt = followUpDateVal;

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
    lead.updatedBy = req.userId;
    lead.updatedByName = assignedByName;
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
    const oldStatus = followUp.status;
    const oldDate = followUp.followUpDate;
    const oldTime = followUp.followUpTime;
    const oldRemarks = followUp.remarks;

    followUp.status = targetStatus;
    followUp.remarks = finalRemarks;
    if (followUpDate) {
      const parsedFuDate = parseFollowUpDateTimeIST(followUpDate, followUpTime || followUp.followUpTime);
      if (parsedFuDate) followUp.followUpDate = parsedFuDate;
    }
    if (followUpTime) followUp.followUpTime = followUpTime.trim();
    followUp.updatedBy = req.userId;
    await followUp.save({ session });

    if (['Done', 'Completed'].includes(targetStatus)) {
      lead.nextFollowUpAt = null;
    } else if (targetStatus === 'Planned') {
      lead.nextFollowUpAt = followUp.followUpDate;
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
    lead.updatedBy = req.userId;
    lead.updatedByName = updaterName;
    await lead.save({ session });

    const isReschedule = (followUpDate && new Date(followUpDate).getTime() !== new Date(oldDate).getTime()) || (followUpTime && followUpTime.trim() !== oldTime);
    const actionName = isReschedule ? 'Sales Follow-up Rescheduled' : (oldStatus !== targetStatus ? 'Sales Follow-up Status Updated' : 'Sales Follow-up Updated');

    // Activity log entry
    await LeadActivity.create([{
      lead: leadId,
      action: actionName,
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        followUpId: followUp._id.toString(),
        previousStatus: oldStatus,
        newStatus: followUp.status,
        previousDate: oldDate,
        newDate: followUp.followUpDate,
        previousTime: oldTime,
        newTime: followUp.followUpTime,
        previousRemarks: oldRemarks,
        newRemarks: followUp.remarks,
        salesAgentId: followUp.salesAgent ? followUp.salesAgent.toString() : null,
        salesAgentName: lead.latestSalesFollowUp?.salesAgentName,
        assignedByName: lead.latestSalesFollowUp?.assignedByName,
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

    lead.updatedBy = req.userId;
    lead.updatedByName = req.user ? (req.user.fullName || req.user.username) : 'System';
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

exports.updateClassification = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    const hasAccess = await canAccessLead(lead, req.userId, req.userRole, req.agentRole);
    if (!isAdmin && !hasAccess) {
      return res.status(403).json({ message: 'Forbidden: You do not have permission to update this lead' });
    }

    const { leadTemperature, temperature, disposition, remark } = req.body;
    const updaterName = req.user?.fullName || req.user?.username || 'Agent';

    const prevTemp = lead.leadTemperature;
    const prevDisp = lead.disposition || lead.latestDisposition;

    let rawTemp = leadTemperature !== undefined ? leadTemperature : temperature;
    if (rawTemp) {
      rawTemp = rawTemp.trim();
      const normalizedTemp = rawTemp.charAt(0).toUpperCase() + rawTemp.slice(1).toLowerCase();
      lead.leadTemperature = normalizedTemp;
      lead.temperatureUpdatedBy = req.userId;
      lead.temperatureUpdatedByName = updaterName;
      lead.temperatureUpdatedAt = new Date();

      if (!lead.temperatureHistory) lead.temperatureHistory = [];
      lead.temperatureHistory.push({
        temperature: normalizedTemp,
        previousTemperature: prevTemp || null,
        changedBy: req.userId,
        changedByName: updaterName,
        changedAt: new Date(),
        source: 'Action',
        remark: remark || `Temperature updated to "${normalizedTemp}" via Action`,
      });
    }

    if (disposition) {
      const cleanDisp = disposition.trim();
      lead.disposition = cleanDisp;
      lead.latestDisposition = cleanDisp;
      lead.dispositionUpdatedBy = req.userId;
      lead.dispositionUpdatedByName = updaterName;
      lead.dispositionUpdatedAt = new Date();

      if (cleanDisp.toLowerCase() === 'won' && lead.closureStatus !== 'WON') {
        lead.closureStatus = 'WON';
        lead.status = 'WON';
        lead.closedBy = req.userId;
        lead.closedAt = new Date();
      } else if (cleanDisp.toLowerCase() === 'lost' && lead.closureStatus !== 'LOST') {
        lead.closureStatus = 'LOST';
        lead.status = 'LOST';
        lead.closedBy = req.userId;
        lead.closedAt = new Date();
      }
    }

    if (remark) {
      lead.latestRemark = remark.trim();
    }

    lead.updatedBy = req.userId;
    lead.updatedByName = updaterName;
    await lead.save();

    // Create activity record
    await LeadActivity.create({
      lead: lead._id,
      action: 'Temperature & Disposition Updated',
      performedBy: req.userId,
      role: req.userRole || req.agentRole || 'AGENT',
      details: `Lead classified as "${lead.leadTemperature || '—'}" with disposition "${lead.disposition || '—'}"`,
      metadata: {
        leadTemperature: lead.leadTemperature,
        disposition: lead.disposition,
        previousTemperature: prevTemp,
        previousDisposition: prevDisp,
        remark: remark || undefined,
        updatedByName: updaterName,
      },
    });

    const classification = classifyLead(lead);
    const effectiveTemp = lead.leadTemperature || classification.temperature;

    res.json({
      message: 'Lead temperature and disposition updated successfully',
      lead: {
        ...lead.toObject(),
        classification: {
          ...classification,
          classification: effectiveTemp || classification.classification,
          temperature: effectiveTemp,
        },
        temperature: effectiveTemp,
        leadTemperature: effectiveTemp,
      },
    });
  } catch (err) {
    next(err);
  }
};
