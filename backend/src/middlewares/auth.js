const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const User = require('../models/User');

exports.authenticate = async (req, res, next) => {
  try {
    let token = null;
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) token = auth.split(' ')[1];
    else token = req.cookies?.accessToken;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'changeme');
    const { sub, sid, role } = decoded;
    if (!sub || !sid) return res.status(401).json({ message: 'Unauthorized' });

    const session = await Session.findById(sid);
    if (!session || !session.valid) return res.status(401).json({ message: 'Session invalid' });
    if (session.expiresAt && session.expiresAt < new Date()) return res.status(401).json({ message: 'Session expired' });

    const user = await User.findById(sub);
    if (!user || !user.active) return res.status(401).json({ message: 'User inactive or not found' });

    req.userId = sub;
    req.userRole = role;
    req.sessionId = sid;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Token expired' });
    next(err);
  }
};

exports.authorizeRole = (roles = []) => (req, res, next) => {
  if (!roles.length) return next();
  if (!roles.includes(req.userRole)) return res.status(403).json({ message: 'Forbidden' });
  next();
};
