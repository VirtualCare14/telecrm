const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const WalkIn = require('../models/WalkIn');
const User = require('../models/User');
const LeadActivity = require('../models/LeadActivity');
const { calculateHaversineDistance } = require('../utils/geoUtils');

exports.createWalkIn = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const leadId = req.params.id;
    const { 
      walkInDate, 
      walkInTime, 
      remark, 
      remarks, 
      salesAgent: targetSalesAgent, 
      salesAgentId, 
      status,
      latitude,
      longitude,
      accuracy,
      locationCapturedAt,
      locationStatus,
      deviceInstallationId
    } = req.body;

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
      return res.status(403).json({ message: 'Forbidden: You do not have permission to record walk-ins for this lead' });
    }

    // Attribution rule: Sales Agent can be assigned by Admin or Calling Agent. Defaults to req.userId.
    const assignedSalesAgentId = targetSalesAgent || salesAgentId || req.userId;
    let salesAgentName = req.user?.fullName || req.user?.username || 'Sales Agent';
    if (assignedSalesAgentId.toString() !== req.userId.toString()) {
      const agentUser = await User.findById(assignedSalesAgentId).session(session);
      if (agentUser) {
        salesAgentName = agentUser.fullName || agentUser.username || 'Sales Agent';
      }
    }

    const assignedByName = req.user?.fullName || req.user?.username || 'Calling Agent';
    const walkInDateVal = new Date(walkInDate);
    const finalRemark = (remark || remarks || '').trim();
    const finalStatus = status || 'Planned';

    // Role determination (Sales Agent vs Calling Agent vs Admin)
    const authAgentRole = (req.agentRole || req.user?.agentRole || '').toLowerCase();
    const isSalesAgent = (req.userRole === 'AGENT' || req.user?.role?.toUpperCase() === 'AGENT') &&
      authAgentRole.includes('sales');

    // Parse location and device metadata safely
    const parsedLat = (latitude !== undefined && latitude !== null && latitude !== '') ? Number(latitude) : null;
    const parsedLng = (longitude !== undefined && longitude !== null && longitude !== '') ? Number(longitude) : null;
    const parsedAcc = (accuracy !== undefined && accuracy !== null && accuracy !== '') ? Number(accuracy) : null;
    const parsedLocStatus = locationStatus || (parsedLat != null && parsedLng != null ? 'Captured' : 'Not Requested');
    const parsedLocCapturedAt = locationCapturedAt ? new Date(locationCapturedAt) : (parsedLat != null ? new Date() : null);
    const parsedDeviceId = (deviceInstallationId && typeof deviceInstallationId === 'string') ? deviceInstallationId.trim() : null;

    let geofenceMeta = {
      hospitalLatitude: lead.hospitalCoordinates?.latitude || null,
      hospitalLongitude: lead.hospitalCoordinates?.longitude || null,
      distanceMetres: null,
      geofenceStatus: 'Exempt',
      geofenceReason: 'Calling Agent / Admin remote access exemption',
    };

    // Location & Geofence are completely OPTIONAL for all roles (including Sales Agent)
    const hosp = lead.hospitalCoordinates;
    if (parsedLat != null && parsedLng != null && hosp?.latitude != null && hosp?.longitude != null) {
      const distance = calculateHaversineDistance(parsedLat, parsedLng, hosp.latitude, hosp.longitude);
      geofenceMeta.hospitalLatitude = hosp.latitude;
      geofenceMeta.hospitalLongitude = hosp.longitude;
      geofenceMeta.distanceMetres = distance;
      if (distance !== null && distance <= 150 && (parsedAcc == null || parsedAcc <= 90)) {
        geofenceMeta.geofenceStatus = 'Passed';
        geofenceMeta.geofenceReason = `Within 150m radius (${Math.round(distance)}m) with accuracy ±${Math.round(parsedAcc || 0)}m`;
      } else if (distance !== null && distance > 150) {
        geofenceMeta.geofenceStatus = 'Failed';
        geofenceMeta.geofenceReason = `Distance (${Math.round(distance)}m) exceeded 150m radius`;
      } else if (parsedAcc != null && parsedAcc > 90) {
        geofenceMeta.geofenceStatus = 'Failed';
        geofenceMeta.geofenceReason = `GPS accuracy (±${Math.round(parsedAcc)}m) exceeded 90m threshold`;
      } else {
        geofenceMeta.geofenceStatus = 'Not Verified';
      }
    } else if (isSalesAgent) {
      geofenceMeta.geofenceStatus = 'Not Verified';
      geofenceMeta.geofenceReason = parsedLocStatus === 'Permission Denied'
        ? 'Location permission denied - visit recorded without geofence verification'
        : 'Location optional - visit recorded without geofence verification';
    } else {
      geofenceMeta.geofenceStatus = 'Exempt';
      geofenceMeta.geofenceReason = 'Calling Agent / Admin remote access exemption';
    }

    const createdWalkIns = await WalkIn.create([{
      lead: leadId,
      salesAgent: assignedSalesAgentId,
      assignedBy: req.userId,
      updatedBy: req.userId,
      walkInDate: walkInDateVal,
      walkInTime: walkInTime.trim(),
      status: finalStatus,
      remark: finalRemark,
      latitude: parsedLat,
      longitude: parsedLng,
      accuracy: parsedAcc,
      locationCapturedAt: parsedLocCapturedAt,
      locationStatus: parsedLocStatus,
      deviceInstallationId: parsedDeviceId,
      ...geofenceMeta,
    }], { session });

    const walkInDoc = createdWalkIns[0];

    // Update latestWalkIn on lead
    lead.latestWalkIn = {
      walkInDate: walkInDateVal,
      walkInTime: walkInTime.trim(),
      remark: finalRemark,
      status: finalStatus,
      salesAgent: assignedSalesAgentId,
      salesAgentName,
      assignedBy: req.userId,
      assignedByName,
      recordedAt: new Date(),
      latitude: parsedLat,
      longitude: parsedLng,
      accuracy: parsedAcc,
      locationCapturedAt: parsedLocCapturedAt,
      locationStatus: parsedLocStatus,
      deviceInstallationId: parsedDeviceId,
      ...geofenceMeta,
    };
    lead.updatedBy = req.userId;
    lead.updatedByName = assignedByName;
    await lead.save({ session });

    // Activity log entry
    await LeadActivity.create([{
      lead: leadId,
      action: 'Walk-in Recorded',
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        walkInId: walkInDoc._id.toString(),
        walkInDate: walkInDateVal,
        walkInTime: walkInTime.trim(),
        remark: finalRemark,
        status: finalStatus,
        salesAgentId: assignedSalesAgentId.toString(),
        salesAgentName,
        assignedByName,
        latitude: parsedLat,
        longitude: parsedLng,
        accuracy: parsedAcc,
        locationStatus: parsedLocStatus,
        deviceInstallationId: parsedDeviceId,
        ...geofenceMeta,
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await WalkIn.findById(walkInDoc._id)
      .populate('salesAgent', 'fullName email username agentRole phone')
      .populate('assignedBy', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    res.status(201).json({ walkIn: populated, latestWalkIn: lead.latestWalkIn });
  } catch (err) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    if (session) {
      session.endSession();
    }
    next(err);
  }
};

exports.updateWalkInStatus = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id: leadId, walkInId } = req.params;
    const { 
      status, 
      remark, 
      remarks, 
      walkInDate, 
      walkInTime,
      latitude,
      longitude,
      accuracy,
      locationCapturedAt,
      locationStatus,
      deviceInstallationId
    } = req.body;

    const lead = await Lead.findById(leadId).session(session);
    if (!lead) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Lead not found' });
    }

    const walkIn = await WalkIn.findOne({ _id: walkInId, lead: leadId }).session(session);
    if (!walkIn) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Walk-in record not found' });
    }

    const isAdmin = req.userRole === 'ADMIN' || req.user?.role?.toUpperCase() === 'ADMIN' || (req.agentRole && req.agentRole.toLowerCase() === 'admin');
    const isOwner = lead.currentOwner?.toString() === req.userId;
    const isAssignedSalesAgent = walkIn.salesAgent?.toString() === req.userId;
    if (!isAdmin && !isOwner && !isAssignedSalesAgent) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden: You can only update walk-ins assigned to you or your leads' });
    }

    const targetStatus = (status || 'Completed').trim();
    const finalRemark = (remark !== undefined ? remark : remarks !== undefined ? remarks : walkIn.remark).trim();

    if (['Done', 'Completed', 'Not Done'].includes(targetStatus) && !finalRemark) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Walk-in remarks are required when completing or marking not done' });
    }

    const updaterName = req.user?.fullName || req.user?.username || 'Agent';
    const oldStatus = walkIn.status;
    const oldDate = walkIn.walkInDate;
    const oldTime = walkIn.walkInTime;
    const oldRemark = walkIn.remark;

    walkIn.status = targetStatus;
    walkIn.remark = finalRemark;
    if (walkInDate) walkIn.walkInDate = new Date(walkInDate);
    if (walkInTime) walkIn.walkInTime = walkInTime.trim();
    walkIn.updatedBy = req.userId;

    if (latitude !== undefined) walkIn.latitude = (latitude !== null && latitude !== '') ? Number(latitude) : null;
    if (longitude !== undefined) walkIn.longitude = (longitude !== null && longitude !== '') ? Number(longitude) : null;
    if (accuracy !== undefined) walkIn.accuracy = (accuracy !== null && accuracy !== '') ? Number(accuracy) : null;
    if (locationStatus) walkIn.locationStatus = locationStatus;
    if (locationCapturedAt) walkIn.locationCapturedAt = new Date(locationCapturedAt);
    if (deviceInstallationId !== undefined) {
      walkIn.deviceInstallationId = (deviceInstallationId && typeof deviceInstallationId === 'string') ? deviceInstallationId.trim() : null;
    }

    const authAgentRole = (req.agentRole || req.user?.agentRole || '').toLowerCase();
    const isSalesAgent = (req.userRole === 'AGENT' || req.user?.role?.toUpperCase() === 'AGENT') &&
      authAgentRole.includes('sales');

    const isCompletingVisit = ['Done', 'Completed'].includes(targetStatus);
    const hasLocationSubmitted = latitude !== undefined && longitude !== undefined;

    // Location & Geofence are completely OPTIONAL for all roles (including Sales Agent)
    const hosp = lead.hospitalCoordinates;
    if (walkIn.latitude != null && walkIn.longitude != null && hosp?.latitude != null && hosp?.longitude != null) {
      const distance = calculateHaversineDistance(walkIn.latitude, walkIn.longitude, hosp.latitude, hosp.longitude);
      walkIn.hospitalLatitude = hosp.latitude;
      walkIn.hospitalLongitude = hosp.longitude;
      walkIn.distanceMetres = distance;
      if (distance !== null && distance <= 150 && (walkIn.accuracy == null || walkIn.accuracy <= 90)) {
        walkIn.geofenceStatus = 'Passed';
        walkIn.geofenceReason = `Within 150m radius (${Math.round(distance)}m) with accuracy ±${Math.round(walkIn.accuracy || 0)}m`;
      } else if (distance !== null && distance > 150) {
        walkIn.geofenceStatus = 'Failed';
        walkIn.geofenceReason = `Distance (${Math.round(distance)}m) exceeded 150m radius`;
      } else if (walkIn.accuracy != null && walkIn.accuracy > 90) {
        walkIn.geofenceStatus = 'Failed';
        walkIn.geofenceReason = `GPS accuracy (±${Math.round(walkIn.accuracy)}m) exceeded 90m threshold`;
      } else {
        walkIn.geofenceStatus = 'Not Verified';
      }
    } else if (isSalesAgent) {
      walkIn.geofenceStatus = 'Not Verified';
      walkIn.geofenceReason = walkIn.locationStatus === 'Permission Denied'
        ? 'Location permission denied - visit updated without geofence verification'
        : 'Location optional - visit updated without geofence verification';
    } else {
      walkIn.hospitalLatitude = lead.hospitalCoordinates?.latitude || null;
      walkIn.hospitalLongitude = lead.hospitalCoordinates?.longitude || null;
      walkIn.geofenceStatus = 'Exempt';
      walkIn.geofenceReason = 'Calling Agent / Admin remote access exemption';
    }

    await walkIn.save({ session });

    // Update latestWalkIn and updatedBy on lead
    lead.latestWalkIn = {
      walkInDate: walkIn.walkInDate,
      walkInTime: walkIn.walkInTime,
      remark: walkIn.remark,
      status: walkIn.status,
      salesAgent: walkIn.salesAgent,
      salesAgentName: lead.latestWalkIn?.salesAgentName || updaterName,
      assignedBy: walkIn.assignedBy || lead.latestWalkIn?.assignedBy,
      assignedByName: lead.latestWalkIn?.assignedByName || updaterName,
      recordedAt: lead.latestWalkIn?.recordedAt || walkIn.createdAt,
      latitude: walkIn.latitude,
      longitude: walkIn.longitude,
      accuracy: walkIn.accuracy,
      locationCapturedAt: walkIn.locationCapturedAt,
      locationStatus: walkIn.locationStatus,
      deviceInstallationId: walkIn.deviceInstallationId,
      hospitalLatitude: walkIn.hospitalLatitude,
      hospitalLongitude: walkIn.hospitalLongitude,
      distanceMetres: walkIn.distanceMetres,
      geofenceStatus: walkIn.geofenceStatus,
      geofenceReason: walkIn.geofenceReason,
    };
    lead.updatedBy = req.userId;
    lead.updatedByName = updaterName;
    await lead.save({ session });

    const isReschedule = (walkInDate && new Date(walkInDate).getTime() !== new Date(oldDate).getTime()) || (walkInTime && walkInTime.trim() !== oldTime);
    const actionName = isReschedule ? 'Walk-in Rescheduled' : (oldStatus !== targetStatus ? 'Walk-in Status Updated' : 'Walk-in Updated');

    // Activity log entry
    await LeadActivity.create([{
      lead: leadId,
      action: actionName,
      performedBy: req.userId,
      role: req.userRole,
      metadata: {
        walkInId: walkIn._id.toString(),
        previousStatus: oldStatus,
        newStatus: walkIn.status,
        previousDate: oldDate,
        newDate: walkIn.walkInDate,
        previousTime: oldTime,
        newTime: walkIn.walkInTime,
        previousRemark: oldRemark,
        newRemark: walkIn.remark,
        salesAgentId: walkIn.salesAgent ? walkIn.salesAgent.toString() : null,
        salesAgentName: lead.latestWalkIn?.salesAgentName,
        assignedByName: lead.latestWalkIn?.assignedByName,
        updatedByName: updaterName,
        latitude: walkIn.latitude,
        longitude: walkIn.longitude,
        accuracy: walkIn.accuracy,
        locationStatus: walkIn.locationStatus,
        deviceInstallationId: walkIn.deviceInstallationId,
        hospitalLatitude: walkIn.hospitalLatitude,
        hospitalLongitude: walkIn.hospitalLongitude,
        distanceMetres: walkIn.distanceMetres,
        geofenceStatus: walkIn.geofenceStatus,
        geofenceReason: walkIn.geofenceReason,
      },
    }], { session });

    await session.commitTransaction();
    session.endSession();

    const populated = await WalkIn.findById(walkIn._id)
      .populate('salesAgent', 'fullName email username agentRole phone')
      .populate('assignedBy', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    res.json({ walkIn: populated, latestWalkIn: lead.latestWalkIn });
  } catch (err) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    if (session) {
      session.endSession();
    }
    next(err);
  }
};

exports.listWalkIns = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const walkIns = await WalkIn.find({ lead: leadId })
      .sort({ walkInDate: -1, createdAt: -1 })
      .populate('salesAgent', 'fullName email username agentRole phone')
      .populate('assignedBy', 'fullName email username agentRole')
      .populate('updatedBy', 'fullName email username agentRole');

    res.json({ walkIns });
  } catch (err) {
    next(err);
  }
};
