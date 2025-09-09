import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  try {
    // Read vercel.json to get the cron schedule
    const vercelConfigPath = path.join(process.cwd(), 'vercel.json');
    const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
    
    // Extract the cron schedule
    const cronSchedule = vercelConfig.crons?.[0]?.schedule || '*/10 * * * *';
    
    // Parse the schedule to get interval in minutes
    const match = cronSchedule.match(/^\*\/(\d+)/);
    const intervalMinutes = match ? parseInt(match[1]) : 10;
    
    res.status(200).json({
      cronSchedule,
      intervalMinutes,
      description: `Checking every ${intervalMinutes} minutes`
    });
  } catch (error) {
    console.error('Error reading cron config:', error);
    // Default fallback values
    res.status(200).json({
      cronSchedule: '*/10 * * * *',
      intervalMinutes: 10,
      description: 'Checking every 10 minutes'
    });
  }
}