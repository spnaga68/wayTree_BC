# 🔐 Authentication & API Collections - README

## 🎯 Start Here!

You're getting:
- ✅ Complete Authentication API with auto-token management
- ✅ All endpoints pre-configured in Postman
- ✅ Zero more "No token provided" errors
- ✅ Detailed guides for setup and usage

---

## 📦 Main File to Import

**→ `Auth-API.postman_collection.json` ← IMPORT THIS FILE**

This single collection includes:
- Authentication endpoints (no auth needed)
- User profile endpoints (auto-token)
- Network codes endpoints (auto-token)
- Connections endpoints (auto-token + public)
- All with automatic token management!

---

## 🚀 Quick Start (3 Steps)

### 1. Import Collection
```
Postman → Import → Select Auth-API.postman_collection.json
```

### 2. Get Token (Auto-Saved!)
```
🔐 AUTHENTICATION → 2. Verify OTP & Get Token → Send
(Use OTP: 123456 in dev mode)
✅ Token automatically saved!
```

### 3. Use Any API
```
👤 USER PROFILE → Get My Profile → Send
🔗 CONNECTIONS → Connect to Network → Send
🌐 NETWORK CODES → Create Network Code → Send
✅ All work with auto-token!
```

---

## 📚 Documentation Files

Choose the guide that fits your needs:

| File | Best For | Time |
|------|----------|------|
| `SOLUTION-SUMMARY.md` | 📊 Visual overview | 5 min |
| `QUICK-START-AUTH.md` | ⚡ Quick reference | 2 min |
| `POSTMAN-SETUP.md` | 🔧 Step-by-step setup | 10 min |
| `AUTH-POSTMAN-GUIDE.md` | 📖 Complete guide | 15 min |
| `COMPLETE-AUTH-SOLUTION.md` | 📚 Full documentation | 20 min |

---

## 🔑 The Magic: How It Works

### Before You Had This
```
You: GET /me
Postman: No token in Authorization header
API: 401 Unauthorized - No token provided
```

### With This Solution
```
You: Verify OTP
Postman: Script runs → Extracts token → Saves to {{authToken}}
You: GET /me
Postman: Automatically adds: Authorization: Bearer {{authToken}}
API: 200 OK - Returns your profile!
```

---

## 📋 What's Included

### 🔐 Authentication (No Auth)
```
POST /auth/request-otp          Get OTP code
POST /auth/verify-otp           Verify OTP & get token ← saves automatically
```

### 👤 User Profile (Auto-Token)
```
GET /me                         Get your profile
PUT /me                         Update your profile
```

### 🌐 Network Codes (Auto-Token)
```
POST /network-codes             Create network code
GET /network-codes              List your codes
GET /network-codes/:codeId      Get code details
PUT /network-codes/:codeId      Update code
DELETE /network-codes/:codeId   Delete code
```

### 🔗 Connections (Auto-Token + Public)
```
POST /connections/connect           Connect to network
GET /connections/my-connections     Get my connections
GET /connections/my-connections?status=pending    Pending only
PUT /connections/:id/status         Accept/reject
DELETE /connections/:id             Delete connection
GET /connections/network-code/:id   Get connections (owner only)
GET /connections/.../members        Get members (public)
GET /connections/.../stats          Get stats (public)
```

---

## 💻 System Requirements

✅ Postman (latest version)  
✅ Internet connection  
✅ Valid email (any format in dev mode)  

---

## 🎯 Common Tasks

### First Time Using
1. Import collection
2. See POSTMAN-SETUP.md
3. Follow Step 1-4
4. Start using APIs!

### Authenticate After Token Expires
1. Go to 🔐 AUTHENTICATION
2. Click "2. Verify OTP & Get Token"
3. Send (uses 123456 in dev)
4. New token saved automatically

### Test Network Features
1. Create network code
2. Get the codeId from response
3. Use another user to connect
4. Accept/reject connections
5. View network statistics

### Make API Call
1. Select endpoint
2. Update request body if needed
3. Click Send
4. View response
5. Use data for next call

---

## 🔍 Token Management

### Auto-Saved
- Token extracted after OTP verification
- Stored in `{{authToken}}` variable
- Used automatically in all protected requests
- Persists across Postman restarts

### Manual Access
- To see token: Right-click collection → Edit → Variables → authToken
- To change token: Update the value there
- To reset: Clear the value and re-authenticate

### Expiration
- Token valid: 30 days
- When expired: 401 Unauthorized
- Solution: Re-verify OTP to get fresh token

---

## 🐛 Troubleshooting

### Issue: "No token provided"
→ Solution: Run "2. Verify OTP & Get Token" step again

### Issue: "Invalid or expired token"
→ Solution: Token is 30 days old, verify OTP again

### Issue: Can't find token variable
→ Solution: Open Postman Console (Cmd+Option+C) and look for "✅ Token saved!" message

### Issue: Still doesn't work
→ Solution: See "Detailed Troubleshooting" in AUTH-POSTMAN-GUIDE.md

---

## 📞 Help Resources

**If you have questions:**

1. **Quick questions?** → See QUICK-START-AUTH.md
2. **Setup help?** → See POSTMAN-SETUP.md
3. **How does it work?** → See SOLUTION-SUMMARY.md
4. **Detailed guide?** → See AUTH-POSTMAN-GUIDE.md
5. **Everything explained?** → See COMPLETE-AUTH-SOLUTION.md

---

## ✨ Key Features

✅ **One-click authentication**
- Request OTP → Verify OTP → Done!

✅ **Automatic token management**
- Extract, save, and use token automatically
- No manual copy-paste needed

✅ **Pre-configured endpoints**
- All 4 API categories included
- Example request bodies provided
- Query parameters documented

✅ **Environment variables**
- baseUrl (API endpoint)
- authToken (JWT token)
- userId (current user)
- userEmail (current user email)

✅ **Test scripts**
- Auto-validate responses
- Helpful console messages
- Extract and save data

✅ **Public endpoints**
- Some endpoints need no auth
- Public member listings
- Network statistics

---

## 🎓 Learning Resources

### Beginner Level
- Import collection
- Authenticate once
- Call GET /me
- View your profile

### Intermediate Level
- Create network code
- List network codes
- Connect to network
- View connections

### Advanced Level
- Accept/reject connections
- Filter by status
- View network statistics
- Manage multiple networks

---

## 🚀 Next Steps

1. **Right now:**
   - Download Auth-API.postman_collection.json
   - Import into Postman

2. **Next (10 minutes):**
   - Read POSTMAN-SETUP.md
   - Follow setup instructions
   - Authenticate once

3. **Then (whenever):**
   - Use any endpoint
   - Create network codes
   - Connect with users
   - View statistics

4. **When questions:**
   - Check QUICK-START-AUTH.md
   - Read relevant guide
   - Check troubleshooting section

---

## ✅ Success Indicators

When this is working:

✅ Can import collection without errors  
✅ See 4 folders in collection: AUTH, PROFILE, NETWORK, CONNECTIONS  
✅ Can request OTP successfully  
✅ Can verify OTP with 123456  
✅ See "✅ Token saved!" in console  
✅ Can call GET /me and get your profile  
✅ Can create network code  
✅ Can connect to network code  
✅ Can accept/reject connections  
✅ No "No token provided" errors  

**All working? 🎉 You're ready to build!**

---

## 📝 Summary

| Aspect | Details |
|--------|---------|
| **Main File** | Auth-API.postman_collection.json |
| **Auth Type** | JWT Bearer Token (OTP-based) |
| **Token Valid** | 30 days |
| **OTP (Dev)** | 123456 (always) |
| **Setup Time** | 5 minutes |
| **API Endpoints** | 20+ pre-configured |
| **Auto-Token** | Yes (script-based) |
| **Error "No token"** | Never again! |

---

## 🎉 You're All Set!

Everything you need is here:
- ✅ Auth collection with auto-token management
- ✅ Pre-configured API endpoints
- ✅ Detailed documentation
- ✅ Troubleshooting guide
- ✅ Usage examples

**Start by importing Auth-API.postman_collection.json and follow POSTMAN-SETUP.md** 🚀

---

**Happy API testing! 🎊**
