/**
 * OIDC Bridge for Matrix Authentication
 * 
 * This module implements a custom OIDC Identity Provider that wraps Firebase Auth.
 * It allows Matrix to use any Firebase authentication method (email, phone, Google, etc.)
 * via the standard OIDC protocol.
 * 
 * Endpoints:
 * - /.well-known/openid-configuration - OIDC discovery document
 * - /authorize - Authorization endpoint (redirects to Firebase Auth)
 * - /token - Token endpoint (exchanges code for tokens)
 * - /userinfo - UserInfo endpoint (returns user profile)
 * 
 * Flow:
 * 1. Matrix redirects user to /authorize
 * 2. User authenticates with Firebase (any method)
 * 3. Bridge redirects back to Matrix with authorization code
 * 4. Matrix exchanges code for tokens at /token
 * 5. Matrix can fetch user info from /userinfo
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import * as crypto from 'crypto';

// In-memory storage for authorization codes (in production, use Firestore)
const authCodes = new Map<string, {
  userId: string;
  redirectUri: string;
  scope: string;
  createdAt: number;
}>();

// Clean up old codes every 5 minutes
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [code, data] of authCodes.entries()) {
    if (data.createdAt < fiveMinutesAgo) {
      authCodes.delete(code);
    }
  }
}, 5 * 60 * 1000);

/**
 * OIDC Discovery Document
 * Tells Matrix where to find our OIDC endpoints
 */
export const oidcDiscovery = onRequest(
  {
    cors: true,
    region: 'europe-west6',
  },
  async (request, response) => {
    const baseUrl = `https://${request.hostname}${request.path.replace('/.well-known/openid-configuration', '')}`;
    
    const discovery = {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,
      userinfo_endpoint: `${baseUrl}/userinfo`,
      jwks_uri: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      claims_supported: [
        'sub',
        'aud',
        'email',
        'email_verified',
        'exp',
        'iat',
        'iss',
        'name',
        'picture',
      ],
    };

    response.json(discovery);
  }
);

/**
 * Authorization Endpoint
 * Handles the initial OAuth authorization request from Matrix
 */
export const oidcAuthorize = onRequest(
  {
    cors: true,
    region: 'europe-west6',
  },
  async (request, response) => {
    try {
      const {
        client_id,
        redirect_uri,
        response_type,
        scope,
        state,
      } = request.query as Record<string, string>;

      // Validate required parameters
      if (!client_id || !redirect_uri || !response_type || response_type !== 'code') {
        response.status(400).send('Invalid authorization request');
        return;
      }

      // Store authorization request in session
      const authRequestId = crypto.randomBytes(32).toString('hex');
      
      // Create a custom Firebase Auth sign-in page URL or redirect to hosted UI
      // For now, we'll create a simple HTML page that uses Firebase Auth
      const signInPageHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Sign in to Matrix</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      max-width: 400px;
      width: 100%;
    }
    h1 {
      margin: 0 0 1.5rem 0;
      font-size: 1.5rem;
      color: #333;
    }
    .info {
      margin-bottom: 1.5rem;
      padding: 1rem;
      background: #f3f4f6;
      border-radius: 4px;
      font-size: 0.875rem;
      color: #666;
    }
    #firebaseui-auth-container {
      margin: 1rem 0;
    }
    .loading {
      text-align: center;
      color: #666;
    }
  </style>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/ui/6.1.0/firebase-ui-auth.js"></script>
  <link type="text/css" rel="stylesheet" href="https://www.gstatic.com/firebasejs/ui/6.1.0/firebase-ui-auth.css" />
</head>
<body>
  <div class="container">
    <h1>🔐 Sign in to Matrix Chat</h1>
    <div class="info">
      Choose your preferred sign-in method below. You can use your email, phone number, or existing Google account.
    </div>
    <div id="firebaseui-auth-container"></div>
    <div id="loader" class="loading">Loading...</div>
  </div>
  
  <script>
    // Initialize Firebase (will be replaced with actual config)
    const firebaseConfig = {
      apiKey: "${process.env.FIREBASE_API_KEY}",
      authDomain: "${process.env.FIREBASE_AUTH_DOMAIN || 'bkaiser-org.firebaseapp.com'}",
      projectId: "${process.env.FIREBASE_PROJECT_ID || 'bkaiser-org'}",
    };
    
    firebase.initializeApp(firebaseConfig);
    
    // Store auth request parameters
    sessionStorage.setItem('oidc_auth_request', JSON.stringify({
      authRequestId: '${authRequestId}',
      clientId: '${client_id}',
      redirectUri: '${redirect_uri}',
      scope: '${scope || 'openid profile email'}',
      state: '${state || ''}',
    }));
    
    // Configure FirebaseUI
    const uiConfig = {
      signInSuccessUrl: '/oidc/callback',
      signInOptions: [
        {
          provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
          requireDisplayName: true,
        },
        {
          provider: firebase.auth.PhoneAuthProvider.PROVIDER_ID,
          defaultCountry: 'CH',
        },
        {
          provider: firebase.auth.GoogleAuthProvider.PROVIDER_ID,
        },
      ],
      callbacks: {
        signInSuccessWithAuthResult: function(authResult) {
          // User signed in, redirect to callback handler
          window.location.href = '/oidc/callback';
          return false;
        },
      },
    };
    
    // Initialize the FirebaseUI Widget
    const ui = new firebaseui.auth.AuthUI(firebase.auth());
    ui.start('#firebaseui-auth-container', uiConfig);
    
    document.getElementById('loader').style.display = 'none';
  </script>
</body>
</html>
      `;

      response.send(signInPageHtml);
    } catch (error) {
      console.error('OIDC authorize error:', error);
      response.status(500).send('Internal server error');
    }
  }
);

/**
 * Callback handler after Firebase Auth
 * Generates authorization code and redirects back to Matrix
 */
export const oidcCallback = onRequest(
  {
    cors: true,
    region: 'europe-west6',
  },
  async (request, response) => {
    try {
      // Get the authorization request from session storage (via client-side redirect)
      // This endpoint is called by the client after successful Firebase Auth
      
      const callbackHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Completing sign-in...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
    }
    .spinner {
      border: 3px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top: 3px solid white;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js"></script>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>Completing sign-in...</h2>
    <p>Please wait while we redirect you back to Matrix.</p>
  </div>
  
  <script>
    (async () => {
      try {
        // Initialize Firebase
        const firebaseConfig = {
          apiKey: "${process.env.FIREBASE_API_KEY || 'AIzaSyCrHhhgiAb-QYLbbjmSG4Fo9IdeRrt0Bz4'}",
          authDomain: "${process.env.FIREBASE_AUTH_DOMAIN || 'bkaiser-org.firebaseapp.com'}",
          projectId: "${process.env.FIREBASE_PROJECT_ID || 'bkaiser-org'}",
        };
        firebase.initializeApp(firebaseConfig);
        
        // Get current user and ID token
        const user = firebase.auth().currentUser;
        if (!user) {
          throw new Error('No user signed in');
        }
        
        const idToken = await user.getIdToken();
        
        // Get stored auth request
        const authRequest = JSON.parse(sessionStorage.getItem('oidc_auth_request') || '{}');
        
        // Exchange Firebase ID token for authorization code
        const response = await fetch('/oidc/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken,
            authRequestId: authRequest.authRequestId,
            redirectUri: authRequest.redirectUri,
            scope: authRequest.scope,
          }),
        });
        
        const data = await response.json();
        
        if (!data.code) {
          throw new Error('Failed to generate authorization code');
        }
        
        // Redirect back to Matrix with authorization code
        const redirectUrl = new URL(authRequest.redirectUri);
        redirectUrl.searchParams.append('code', data.code);
        if (authRequest.state) {
          redirectUrl.searchParams.append('state', authRequest.state);
        }
        
        window.location.href = redirectUrl.toString();
      } catch (error) {
        console.error('Callback error:', error);
        document.body.innerHTML = '<div class="container"><h2>❌ Error</h2><p>' + error.message + '</p></div>';
      }
    })();
  </script>
</body>
</html>
      `;

      response.send(callbackHtml);
    } catch (error) {
      console.error('OIDC callback error:', error);
      response.status(500).send('Internal server error');
    }
  }
);

/**
 * Exchange Firebase ID token for authorization code
 * Called by the callback page after Firebase Auth
 */
export const oidcExchange = onRequest(
  {
    cors: true,
    region: 'europe-west6',
  },
  async (request, response) => {
    try {
      const { idToken, authRequestId, redirectUri, scope } = request.body;

      if (!idToken || !redirectUri) {
        response.status(400).json({ error: 'Missing required parameters' });
        return;
      }

      // Verify Firebase ID token
      const decodedToken = await getAuth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      // Generate authorization code
      const code = crypto.randomBytes(32).toString('hex');
      
      // Store authorization code with user info
      authCodes.set(code, {
        userId,
        redirectUri,
        scope: scope || 'openid profile email',
        createdAt: Date.now(),
      });

      response.json({ code });
    } catch (error) {
      console.error('OIDC exchange error:', error);
      response.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * Token Endpoint
 * Exchanges authorization code for access token and ID token
 */
export const oidcToken = onRequest(
  {
    cors: true,
    region: 'europe-west6',
  },
  async (request, response) => {
    try {
      const {
        grant_type,
        code,
        redirect_uri,
        client_id,
        client_secret,
      } = request.body;

      console.log('Token request:', { grant_type, code: code?.substring(0, 10), redirect_uri, client_id });

      // Validate grant type
      if (grant_type !== 'authorization_code') {
        response.status(400).json({
          error: 'unsupported_grant_type',
          error_description: 'Only authorization_code grant type is supported',
        });
        return;
      }

      // Validate authorization code
      const authData = authCodes.get(code);
      if (!authData) {
        response.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid or expired authorization code',
        });
        return;
      }

      // Validate redirect URI matches
      if (authData.redirectUri !== redirect_uri) {
        response.status(400).json({
          error: 'invalid_grant',
          error_description: 'Redirect URI mismatch',
        });
        return;
      }

      // Delete the code (one-time use)
      authCodes.delete(code);

      // Get user data from Firebase Auth
      const userRecord = await getAuth().getUser(authData.userId);

      // Generate access token (Firebase ID token)
      const customToken = await getAuth().createCustomToken(authData.userId);
      
      // Note: In production, you'd generate proper JWT tokens
      // For now, we'll use the user ID as a simple token
      const accessToken = crypto.randomBytes(32).toString('hex');
      
      // Store access token mapping (in production, use Firestore)
      // For now, we can use the access token as a key to userId
      
      // Create ID token (JWT with user claims)
      const idToken = await createIdToken(userRecord, client_id);

      response.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: idToken,
        scope: authData.scope,
      });
    } catch (error) {
      console.error('OIDC token error:', error);
      response.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error',
      });
    }
  }
);

/**
 * UserInfo Endpoint
 * Returns user profile information
 */
export const oidcUserInfo = onRequest(
  {
    cors: true,
    region: 'europe-west6',
  },
  async (request, response) => {
    try {
      // Get access token from Authorization header
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        response.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const accessToken = authHeader.substring(7);

      // In production, verify and decode the access token
      // For now, we'll need to store token->userId mapping
      // This is a simplified version

      // Return user info
      response.json({
        sub: 'user_id_here',
        name: 'User Name',
        email: 'user@example.com',
        email_verified: true,
        picture: 'https://example.com/avatar.jpg',
      });
    } catch (error) {
      console.error('OIDC userinfo error:', error);
      response.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * Helper function to create ID token (JWT)
 */
async function createIdToken(userRecord: any, audience: string): Promise<string> {
  // In a production environment, you would:
  // 1. Create a proper JWT with RS256 signing
  // 2. Include all required OIDC claims
  // 3. Sign with your private key
  
  // For now, we'll use Firebase's custom token as a placeholder
  // You should implement proper JWT signing here
  
  const payload = {
    iss: 'https://your-oidc-bridge-url',
    sub: userRecord.uid,
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    email: userRecord.email,
    email_verified: userRecord.emailVerified,
    name: userRecord.displayName || userRecord.email?.split('@')[0],
    picture: userRecord.photoURL,
  };

  // TODO: Implement proper JWT signing
  // For now, return a base64-encoded JSON (NOT SECURE, just for testing)
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}
