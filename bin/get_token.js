#!/usr/bin/env node
/**
 * Helper script to extract Cognito token from browser localStorage
 * 
 * Usage:
 * 1. Open browser console on https://vocab.vincentchan.cloud
 * 2. Copy and paste this entire script into the console
 * 3. It will display the token and copy it to clipboard
 */

(function() {
  const token = localStorage.getItem('cognito_id_token');
  
  if (!token) {
    console.error('❌ No token found in localStorage. Make sure you are logged in.');
    return;
  }
  
  console.log('✅ Token found!');
  console.log('Token:', token);
  console.log('\n--- Token (for copying) ---');
  console.log(token);
  
  // Try to copy to clipboard
  if (navigator.clipboard) {
    navigator.clipboard.writeText(token).then(() => {
      console.log('\n✅ Token copied to clipboard!');
    }).catch(err => {
      console.log('\n⚠️  Could not copy to clipboard automatically. Copy manually from above.');
    });
  } else {
    console.log('\n⚠️  Clipboard API not available. Copy manually from above.');
  }
  
  // Also create a global variable for easy access
  window.__COGNITO_TOKEN__ = token;
  console.log('\n💡 Token also available as window.__COGNITO_TOKEN__');
})();

