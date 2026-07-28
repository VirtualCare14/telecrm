const Counter = require('../models/Counter');

async function getNextSequence(name) {
  const ret = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return ret.seq;
}

function formatLeadNumber(seq) {
  return seq.toString().padStart(5, '0');
}

module.exports = { getNextSequence, formatLeadNumber };
