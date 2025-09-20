#!/usr/bin/env node
// Test the incremental medal update functionality

require("dotenv").config();

async function testIncrementalUpdate() {
  console.log('🧪 Testing incremental medal update...');

  try {
    // Import the update function
    const updateModule = require('../api/update-global-medals');

    // Create mock request/response objects
    const mockReq = {
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET || 'test'}`
      }
    };

    const mockRes = {
      status: (code) => ({
        json: (data) => {
          console.log(`\n📊 Response (${code}):`);
          console.log(JSON.stringify(data, null, 2));
          return data;
        }
      })
    };

    // Call the update function
    await updateModule(mockReq, mockRes);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testIncrementalUpdate();