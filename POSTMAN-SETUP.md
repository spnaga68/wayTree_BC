# 🔐 Postman Setup Instructions

## Import the Auth Collection

### Option 1: Import from File
1. Open Postman
2. Click **Import** button (top left)
3. Select **File** tab
4. Choose `Auth-API.postman_collection.json`
5. Click **Import**

### Option 2: Import from Link (if available)
1. Click **Import** button
2. Select **Link** tab
3. Paste collection URL
4. Click **Import**

---

## First Time Setup

### 1. Verify Base URL
- Open the collection
- Click **Variables** tab (in collection)
- Check `baseUrl` = `https://cpt4x27j-3000.inc1.devtunnels.ms`
- Or change to: `http://localhost:3000` (if running locally)

### 2. Test Authentication
1. Go to **🔐 AUTHENTICATION** folder
2. Click **1. Request OTP**
3. Change email in body (or keep as is)
4. Click **Send**
5. Check response: `{"success": true}`

### 3. Verify OTP & Get Token
1. Click **2. Verify OTP & Get Token**
2. Use OTP: `123456` (dev mode always)
3. Click **Send**
4. Look for: `{"token": "eyJhbGci...", ...}`
5. Check Postman Console: should see ✅ **Token saved!**

### 4. Try Protected Endpoint
1. Go to **👤 USER PROFILE** folder
2. Click **Get My Profile**
3. Click **Send**
4. Should return your user profile!

---

## Token Debugging

### Check if Token is Saved
1. Press **Cmd+Option+C** (Mac) or **Ctrl+Alt+C** (Windows)
2. Postman Console opens
3. Run OTP verification again
4. Look for log: **"✅ Token saved to {{authToken}}"**
5. If you see this: ✅ Token is working

### Manual Token Check
1. Click **Environments** in sidebar
2. Click your environment
3. Look for `authToken` variable
4. If empty: token not saved (run OTP verification again)
5. If has value: token is there

### Add Token Manually (if auto-save fails)
1. Run **2. Verify OTP & Get Token**
2. Copy the `token` value from response
3. Right-click collection → **Edit**
4. Go to **Variables** tab
5. Find `authToken` variable
6. Paste token in "Current Value"
7. Click **Save**

---

## API Request Workflow

### Correct Order:
```
1. Request OTP
   ↓
2. Verify OTP & Get Token ✅ (token saved)
   ↓
3. Use any protected API (token auto-added)
```

### Common Mistakes:
❌ Trying to call protected API before verifying OTP  
❌ Not checking console for token saved message  
❌ Using different email in OTP verification  
❌ Typing wrong OTP (use: 123456)

---

## Making Requests

### Protected Requests (Most APIs)
```
1. Select endpoint
2. Click "Authorization" tab
3. See: Bearer {{authToken}}
4. Click "Send"
5. ✅ Works automatically!
```

### Public Requests (No Auth)
```
1. Select endpoint (members, stats, etc.)
2. Click "Send"
3. No Authorization header needed
4. Works fine!
```

---

## Response Examples

### ✅ Success Response
```json
{
  "id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "founder"
}
```

### ❌ Token Missing Error
```json
{
  "error": "Unauthorized",
  "message": "No token provided"
}
```
**Fix:** Go back to step "Verify OTP & Get Token"

### ❌ Invalid Token Error
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```
**Fix:** Token expired (30 days). Verify OTP again.

### ❌ Validation Error
```json
{
  "error": "Bad Request",
  "message": "Invalid email format"
}
```
**Fix:** Check request body for correct format

---

## Advanced: Using Scripts

### Pre-Request Script (runs before API call)
- Adds Bearer token to header
- Validates token exists
- Can modify request

### Test Script (runs after response)
- Auto-saves token
- Validates response
- Logs helpful messages

**To view scripts:**
1. Select any request
2. Click "Tests" tab (or "Pre-request Script" tab)
3. See the JavaScript code

---

## Environment vs Collection Variables

| Variable Type | Scope | Persistence | Use Case |
|---|---|---|---|
| **Environment** | Current environment only | Session only | Temporary values |
| **Collection** | Whole collection | Persists | Long-term tokens |
| **Global** | All collections | Persists | Shared across projects |

**Our setup uses:**
- Collection variables: `{{authToken}}` - persists
- Environment variables: User data backup

---

## Troubleshooting Checklist

- [ ] Imported Auth-API.postman_collection.json
- [ ] Base URL is correct (tunnel or localhost)
- [ ] Ran "1. Request OTP" successfully
- [ ] Ran "2. Verify OTP & Get Token" successfully
- [ ] Checked console for "✅ Token saved!"
- [ ] Can see `authToken` in Variables
- [ ] Tried "Get My Profile" endpoint
- [ ] Got successful response with user data

If all checked: ✅ **Setup complete! You're ready to use all APIs**

---

## Next Steps

1. ✅ Setup complete
2. Go to **Network Codes** folder
3. Create a network code
4. Go to **Connections** folder
5. Try connecting to a network
6. Accept/reject connections
7. View statistics

**Enjoy! 🎉**
