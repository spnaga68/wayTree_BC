# 🔐 Authentication & API Guide for Postman

## 🚀 Quick Start (3 Steps)

### Step 1: Request OTP
```
1. Open Postman
2. Import "Auth-API.postman_collection.json"
3. Go to "🔐 AUTHENTICATION" → "1. Request OTP"
4. Change email in body to your test email
5. Click Send
6. Check console/terminal for OTP (dev mode: always "123456")
```

### Step 2: Verify OTP & Get Token ✅
```
1. Go to "🔐 AUTHENTICATION" → "2. Verify OTP & Get Token"
2. Use same email + OTP "123456"
3. Click Send
4. ✅ Token is automatically saved!
```

### Step 3: Use Protected APIs
```
1. Go to any endpoint in "👤 USER PROFILE" or "🔗 CONNECTIONS"
2. Click Send
3. ✅ Token is automatically added to Authorization header!
```

---

## 📋 How Token Management Works

### 🔴 Problem You Had
```
{
    "error": "Unauthorized",
    "message": "No token provided"
}
```

### ✅ Solution
The collection has **automatic token management**:

1. **When you verify OTP** (Step 2):
   - Token is extracted from response
   - Automatically saved to `{{authToken}}` variable
   - Also saved to collection variables for persistence

2. **For all protected API calls**:
   - Bearer token is automatically added to `Authorization` header
   - Header format: `Authorization: Bearer {token}`
   - Works for all endpoints that need auth

3. **Token is reused** across all requests:
   - No need to copy-paste token
   - No need to manually add headers
   - Just call any protected API and it works!

---

## 🔍 The Magic Script (Auto Token Saving)

When you call "2. Verify OTP & Get Token", this script runs:

```javascript
// 📝 Tests tab in Postman
if (pm.response.code === 200) {
    const responseData = pm.response.json();
    
    // Save token to environment
    pm.environment.set('authToken', responseData.token);
    
    // Save to collection (persists)
    pm.collectionVariables.set('authToken', responseData.token);
    
    // Save user info
    pm.environment.set('userId', responseData.user.id);
    pm.environment.set('userEmail', responseData.user.email);
    
    console.log('✅ Token saved!');
}
```

This is why the token automatically appears in `{{authToken}}` and works everywhere!

---

## 🎯 Complete Workflow

### Workflow 1: First Time Authentication
```
1. Request OTP
   POST /auth/request-otp
   Body: {"email": "user@example.com"}
   ↓
2. Verify OTP ✅ (Token auto-saved)
   POST /auth/verify-otp
   Body: {"email": "user@example.com", "otp": "123456"}
   ↓
3. Update Profile
   PUT /me
   Authorization: Bearer {{authToken}} (auto-added)
   ↓
4. Create Network Code
   POST /network-codes
   Authorization: Bearer {{authToken}} (auto-added)
   ↓
5. Connect to Network
   POST /connections/connect
   Authorization: Bearer {{authToken}} (auto-added)
```

### Workflow 2: Reusing Token Next Session
```
1. Token still exists in {{authToken}} variable
2. You can directly call protected APIs
3. No need to re-authenticate!
4. Token valid for 30 days
```

### Workflow 3: Token Expired
```
If you get 401 error:
1. Go back to "2. Verify OTP & Get Token"
2. Get fresh OTP (123456)
3. Click Send
4. New token is saved automatically
5. Continue calling APIs
```

---

## 🔗 API Endpoints by Category

### 🔐 Authentication (No token needed)
```
POST /auth/request-otp
POST /auth/verify-otp
```

### 👤 User Profile (Token needed)
```
GET  /me
PUT  /me
```

### 🌐 Network Codes (Token needed for create/update)
```
POST   /network-codes
GET    /network-codes
GET    /network-codes/:codeId
PUT    /network-codes/:codeId
DELETE /network-codes/:codeId
```

### 🔗 Connections (Mixed auth)
```
POST   /connections/connect (token needed)
GET    /connections/my-connections (token needed)
GET    /connections/network-code/:codeId (token needed)
PUT    /connections/:connectionId/status (token needed)
DELETE /connections/:connectionId (token needed)
GET    /connections/network-code/:codeId/members (public)
GET    /connections/network-code/:codeId/stats (public)
```

---

## 🎓 Advanced: Manual Token Management

If auto-save doesn't work, you can manually manage tokens:

### 1. Get Token from Response
```
After calling "2. Verify OTP & Get Token":
- Response shows: {"token": "eyJhbGci....", ...}
- Copy the token value
```

### 2. Add to Environment Variables
```
1. Click "Environments" in Postman left sidebar
2. Click your active environment
3. Add new variable:
   - Key: authToken
   - Value: (paste token here)
4. Click Save
```

### 3. Verify It Works
```
1. Go to any protected endpoint
2. Click "Authorization" tab
3. Type: Bearer {{authToken}}
4. Send request
5. Should work now!
```

---

## 🐛 Troubleshooting

### Issue: Still getting "No token provided"

**Solution 1: Check if token exists**
- Open Postman Console (Ctrl+Alt+C / Cmd+Option+C)
- Look for "✅ Token saved!" message
- If not there, verify OTP step didn't complete

**Solution 2: Manually set token**
- Right-click collection name
- Select "Edit"
- Go to "Variables" tab
- Set "authToken" to your token value
- Save

**Solution 3: Check Authorization header**
- Click request
- Go to "Authorization" tab
- Make sure "Bearer {{authToken}}" is set
- Try typing it manually: Bearer YOUR_TOKEN_HERE

### Issue: Getting "Invalid or expired token"

**Solution:**
- Token is valid for 30 days
- If expired, go back to "2. Verify OTP & Get Token"
- Get fresh OTP (123456) and verify again
- New token will be saved

### Issue: OTP not working

**In Dev Mode (current):**
- OTP is always: **123456**
- No real email needed
- Use any email format

**In Production:**
- Real OTP will be sent via email
- Check spam folder
- OTP expires in 10 minutes

---

## 📝 Example API Calls

### Get My Profile
```bash
GET /me
Authorization: Bearer {{authToken}}
```

**Response:**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "founder",
  "primaryGoal": "fundraising",
  "company": "Acme Corp"
}
```

### Create Network Code
```bash
POST /network-codes
Authorization: Bearer {{authToken}}
Content-Type: application/json

{
  "name": "Tech Startup Network",
  "description": "Connect with tech founders",
  "keywords": ["startup", "tech"],
  "autoConnect": false,
  "expirationTime": "2025-12-31T23:59:59Z"
}
```

### Connect to Network
```bash
POST /connections/connect
Authorization: Bearer {{authToken}}
Content-Type: application/json

{
  "codeId": "TSN2024",
  "message": "I'd love to join!"
}
```

### Accept Connection
```bash
PUT /connections/{connectionId}/status
Authorization: Bearer {{authToken}}
Content-Type: application/json

{
  "status": "accepted"
}
```

---

## 🌍 Environment Variables

The collection includes these variables:

| Variable | Purpose | Set By |
|---|---|---|
| `{{baseUrl}}` | API base URL | Manual (default: tunnel URL) |
| `{{authToken}}` | JWT token | Auto-saved after OTP verify |
| `{{userId}}` | Current user ID | Auto-saved after OTP verify |
| `{{userEmail}}` | User email | Auto-saved after OTP verify |
| `{{connectionId}}` | Connection ID for updates | Manual |

**To change base URL:**
- Go to "Variables" tab in collection
- Change `baseUrl` value
- Options:
  - Dev: `http://localhost:3000`
  - Tunnel: `https://cpt4x27j-3000.inc1.devtunnels.ms`
  - Production: Your production URL

---

## ✨ Summary

✅ **No more "No token provided" errors!**

1. ✅ Auth collection with automatic token management
2. ✅ Token automatically saved after OTP verification
3. ✅ Token automatically added to all protected requests
4. ✅ Pre-configured endpoints for all APIs
5. ✅ Includes connection filtering examples
6. ✅ Public endpoints included (no auth needed)

**You can now:**
- ✅ Authenticate in 2 steps
- ✅ Call protected APIs immediately
- ✅ Never worry about token headers again
- ✅ Reuse token across requests
- ✅ Easily test all endpoints

**Happy API testing! 🚀**
