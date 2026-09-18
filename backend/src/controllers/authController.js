const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Session = require('../models/Session');
const crypto = require('crypto');

const parseExpiry = (expStr) => {
  // simple parser: accepts '1d', '12h', '30m' etc.
  if (!expStr) return 24 * 60 * 60 * 1000;
  const v = parseInt(expStr.slice(0, -1), 10);
  const u = expStr.slice(-1);
  if (u === 'd') return v * 24 * 60 * 60 * 1000;
  if (u === 'h') return v * 60 * 60 * 1000;
  if (u === 'm') return v * 60 * 1000;
  return 24 * 60 * 60 * 1000;
};

exports.login = async (req, res, next) => {
  try {
    const { usernameOrEmail, password } = req.body;
    const identifier = (usernameOrEmail || '').trim();
    if (!identifier || !password) {
      return res.status(400).json({ message: 'Missing credentials' });
    }

    // Flexible case-insensitive lookup: username, email, fullName, agentRole, or common aliases
    const escapedIdentifier = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let user = await User.findOne({
      $or: [
        { email: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') } },
        { username: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') } }
      ]
    });

    // Match by exact full name
    if (!user) {
      user = await User.findOne({
        fullName: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') }
      });
    }

    // Match by agentRole (e.g. "Sales Agent", "Calling Agent")
    if (!user) {
      user = await User.findOne({
        role: 'AGENT',
        active: true,
        agentRole: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') }
      });
    }

    // Match by role aliases ("sales", "salesagent", "calling", "callingagent")
    if (!user) {
      const normalizedKey = identifier.toLowerCase().replace(/[\s_-]+/g, '');
      if (normalizedKey === 'sales' || normalizedKey === 'salesagent') {
        user = await User.findOne({ role: 'AGENT', active: true, agentRole: { $regex: /sales/i } });
      } else if (normalizedKey === 'calling' || normalizedKey === 'callingagent') {
        user = await User.findOne({ role: 'AGENT', active: true, agentRole: { $regex: /calling/i } });
      }
    }

    // Match by prefix (e.g. "prince" -> Prince0908, "jyoti" -> jyoti0411)
    if (!user && escapedIdentifier.length >= 3) {
      user = await User.findOne({
        $or: [
          { username: { $regex: new RegExp(`^${escapedIdentifier}`, 'i') } },
          { fullName: { $regex: new RegExp(`^${escapedIdentifier}`, 'i') } }
        ]
      });
    }

    if (!user) {
      console.warn(`[AUTH] Login failed: User not found for identifier "${identifier}"`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.active) {
      return res.status(403).json({ message: 'Account is inactive. Please contact your administrator.' });
    }

    let match = false;
    const hash = user.passwordHash || user.password;
    if (hash && hash.length >= 20) {
      try {
        match = await bcrypt.compare(password, hash);
        // Fallback: If initial comparison fails, try capital/lowercase first letter (e.g. jyoti@1402 vs Jyoti@1402)
        if (!match && password.length > 0) {
          const cap = password.charAt(0).toUpperCase() + password.slice(1);
          if (cap !== password) {
            match = await bcrypt.compare(cap, hash);
          }
        }
        if (!match && password.length > 0) {
          const lower = password.charAt(0).toLowerCase() + password.slice(1);
          if (lower !== password) {
            match = await bcrypt.compare(lower, hash);
          }
        }
      } catch (err) {
        match = false;
      }
    }



    if (!match) {
      console.warn(`[AUTH] Password mismatch for user "${user.username}" (role: ${user.role})`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log(`[AUTH] Successfully logged in: "${user.username}" (${user.role} - ${user.agentRole || 'NoRole'})`);

    // Allow multiple sessions - no blocking
    // create session
    const jwtExpires = process.env.JWT_EXPIRES_IN || '1d';
    const ttl = parseExpiry(jwtExpires);
    const expiresAt = new Date(Date.now() + ttl);

    // generate refresh token and persist in httpOnly cookie
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const refreshTtl = 30 * 24 * 60 * 60 * 1000; // 30 days
    const refreshExpiresAt = new Date(Date.now() + refreshTtl);

    const session = await Session.create({ user: user._id, expiresAt, refreshToken, refreshExpiresAt });

    const payload = {
      sub: user._id.toString(),
      role: user.role,
      agentRole: user.agentRole,
      sid: session._id.toString(),
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || 'changeme', { expiresIn: jwtExpires });

    user.lastLoginAt = new Date();
    await user.save();

    const isSecure = (process.env.COOKIE_SECURE === 'true') || process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      maxAge: refreshTtl,
      sameSite: isSecure ? 'none' : 'lax',
      secure: isSecure,
      path: '/',
    };

    // set access token cookie
    const accessCookieOptions = {
      httpOnly: true,
      maxAge: ttl,
      sameSite: isSecure ? 'none' : 'lax',
      secure: isSecure,
      path: '/',
    };
    res.cookie('accessToken', token, accessCookieOptions);
    // set refresh cookie
    res.cookie('refreshToken', refreshToken, cookieOptions);

    res.json({ 
      token,
      accessTokenExpiresAt: expiresAt.getTime(), 
      user: { 
        id: user._id, 
        fullName: user.fullName, 
        email: user.email, 
        username: user.username,
        role: user.role,
        agentRole: user.agentRole,
        active: user.active
      } 
    });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const sessionId = req.sessionId;
    if (!sessionId) return res.status(400).json({ message: 'No active session' });
    await Session.findByIdAndUpdate(sessionId, { valid: false, refreshToken: null, refreshExpiresAt: null });
    res.clearCookie('refreshToken', { path: '/' });
    res.clearCookie('accessToken', { path: '/' });
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) return res.status(401).json({ message: 'No refresh token' });

    const now = new Date();
    const session = await Session.findOne({ refreshToken, valid: true, refreshExpiresAt: { $gt: now } });
    if (!session) return res.status(401).json({ message: 'Invalid or expired refresh token' });

    const user = await User.findById(session.user);
    if (!user || !user.active) return res.status(401).json({ message: 'User not found or inactive' });

    // rotate refresh token
    const newRefresh = crypto.randomBytes(48).toString('hex');
    const refreshTtl = 30 * 24 * 60 * 60 * 1000; // 30 days
    const newRefreshExpiresAt = new Date(Date.now() + refreshTtl);

    // extend session expiry for access token
    const jwtExpires = process.env.JWT_EXPIRES_IN || '1d';
    const ttl = parseExpiry(jwtExpires);
    const newExpiresAt = new Date(Date.now() + ttl);

    session.refreshToken = newRefresh;
    session.refreshExpiresAt = newRefreshExpiresAt;
    session.expiresAt = newExpiresAt;
    await session.save();

    const payload = { 
      sub: user._id.toString(), 
      role: user.role, 
      agentRole: user.agentRole, 
      sid: session._id.toString() 
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'changeme', { expiresIn: jwtExpires });

    const isSecure = (process.env.COOKIE_SECURE === 'true') || process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      maxAge: refreshTtl,
      sameSite: isSecure ? 'none' : 'lax',
      secure: isSecure,
      path: '/',
    };
    res.cookie('refreshToken', newRefresh, cookieOptions);
    // set access token cookie
    const accessCookieOptions = {
      httpOnly: true,
      maxAge: ttl,
      sameSite: isSecure ? 'none' : 'lax',
      secure: isSecure,
      path: '/',
    };
    res.cookie('accessToken', token, accessCookieOptions);

    res.json({ accessTokenExpiresAt: newExpiresAt.getTime() });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
};
