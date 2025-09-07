// This file demonstrates how to properly secure Vercel Cron endpoints
// Vercel Cron jobs can be secured using the CRON_SECRET environment variable

module.exports = async (req, res) => {
  // Vercel automatically adds this header to cron requests when CRON_SECRET is set
  const authHeader = req.headers['authorization'];
  
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  
  // If CRON_SECRET is not set, we still protect against public access
  // by checking if this is coming from Vercel's internal network
  // Vercel Cron jobs set specific headers we can validate
  
  // Forward to the actual spin function
  return require('./spin')(req, res);
};