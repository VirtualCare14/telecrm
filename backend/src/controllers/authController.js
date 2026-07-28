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
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ message: 'Missing credentials' });
    }

    const user = await User.findOne({
      $or: [{ email: usernameOrEmail }, { username: usernameOrEmail }]
    });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    if (!user.active) return res.status(403).json({ message: 'Account is inactive' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

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

    res.json({ accessTokenExpiresAt: expiresAt.getTime(), user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role } });
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

    const payload = { sub: user._id.toString(), role: user.role, sid: session._id.toString() };
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
