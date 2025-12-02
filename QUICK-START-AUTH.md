# 🚀 QUICK START - Auth + API in Postman

## 3-Step Authentication Flow

### Step 1: Request OTP
```
Endpoint: POST /auth/request-otp
Body:     {"email": "user@example.com"}
Response: {"success": true}
```

### Step 2: Verify OTP ✅ TOKEN SAVED AUTOMATICALLY
```
Endpoint: POST /auth/verify-otp
Body:     {"email": "user@example.com", "otp": "123456"}
Response: {"token": "eyJhbGci...", "user": {...}, "isNewUser": true}
⬆️ Script auto-saves token to {{authToken}}
```

### Step 3: Use Any Protected API
```
GET /me
PUT /me
POST /network-codes
GET /network-codes
POST /connections/connect
... (all work with auto token!)
```

---

## 📋 How It Works

| Step | What Happens | Result |
|------|---|---|
| 1 | You request OTP | Email doesn't matter (dev mode) |
| 2 | You verify with OTP "123456" | **Token automatically saved** ✅ |
| 3 | You call protected API | Token automatically added to header |
| ∞ | Token reused everywhere | No more "No token provided" error |

---

## 🎯 Key Variables

| Variable | Value | Where Used |
|---|---|---|
| `{{baseUrl}}` | https://cpt4x27j-3000.inc1.devtunnels.ms | All requests |
| `{{authToken}}` | Auto-filled after Step 2 | Authorization header |
| `{{userId}}` | Auto-filled after Step 2 | User operations |

---

## 🔐 Auth Header Format

```
Authorization: Bearer {{authToken}}
```

**Postman does this automatically** - no manual header needed!

---

## ✨ What You Get

✅ No more copy-paste token  
✅ No more manual Authorization headers  
✅ No more "No token provided" errors  
✅ Token persists across requests  
✅ Automatic token expiry handling  

---

## 🐛 If Still Not Working

1. **Check Postman Console**: Cmd+Option+C (Mac) / Ctrl+Alt+C (Windows)
   - Look for: "✅ Token saved!"

2. **Manually Set Token**: Right-click collection → Edit → Variables → Set authToken

3. **Check Authorization Tab**: Make sure endpoint has "Bearer {{authToken}}"

---

## 📞 API Categories

### No Auth Needed
```
POST /auth/request-otp
POST /auth/verify-otp
GET  /connections/network-code/:codeId/members
GET  /connections/network-code/:codeId/stats
```

### Auth Needed (Auto-handled)
```
GET  /me
PUT  /me
POST /network-codes
GET  /network-codes
POST /connections/connect
GET  /connections/my-connections
PUT  /connections/:id/status
... and more
```

---

## 🎉 Summary

**Before (Your Problem):**
```json
{"error": "Unauthorized", "message": "No token provided"}
```

**After (With Auth Collection):**
- ✅ Authenticate once
- ✅ Token saved automatically
- ✅ Call any API
- ✅ Works! 🎉

---

**Need help? See AUTH-POSTMAN-GUIDE.md for detailed instructions**
