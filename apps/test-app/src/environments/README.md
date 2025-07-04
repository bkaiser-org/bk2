# Environment setup

This readme file describes the working of the environment setup. 
Additionally, it makes sure that the environments directory is made persistent as it is not generated by the scripts.

## Environment configuration

As a preparation for the build process, script bk2/set-env.js is called with 

```sh
ts-node ./set-env.js
```

to generate environment.ts for test environment and environment.prod.ts for prod environment.

See target config in bk2/apps/{APPDIR}/project.json.

DO NOT COMMIT THE environment*.ts FILES INTO YOUR SOURCE CODE MANAGEMENT SYSTEM AS THEY CONTAIN SENSITIVE INFORMATION.


### Environment parameters in productive environment

In prod environment with Firebase AppHosting deployment, the environment parameters are read from Google Cloud Secrets.
The secrets are read once during build time by the build script (target config in bk2/apps/{APPDIR}/project.json).
The secret names are identical for all tenants. That's why you need to make sure to adapt the following tenant-specific values before starting the build of a different tenant:

- NEXT_PUBLIC_AUTH_TENANTID
- ev. DPO and OP contact information
- FIREBASE_APP_ID
- APP_TITLE
- APP_SUBTITLE
- APP_NAME
- APP_VERSION
- APP_DOMAIN
- APP_LATITUDE and APP_LONGITUDE

Tip: consider .env as the master data and copy the values into GCP Secret Manager.

Add secrets on the command line with 

```sh
firebase apphosting:secrets:set {SECRET_NAME} {SECRET_VALUE}
```

Alternatively, you may use the Secret Manager view in the google cloud console.

Make sure to configure the correct permissions to make these secrets readable.
For the Firebase App Hosting Service (runtime and build-time injection), the service account that your Firebase App Hosting backend runs as needs the Secret Manager Secret Accessor role (roles/secretmanager.secretAccessor) on the secrets it needs to access.

This service account is typically one of the following:
- a dedicated Firebase App Hosting service account: service-PROJECT_NUMBER@gcp-sa-apphosting.iam.gserviceaccount.com (common for newer projects)
- the compute engine default service account PROJECT_NUMBER-compute@developer.gserviceaccount.com (might be used in older projects or certain configurations)

When you configure the secrets, Firebase usually attempts to automatically grant this role to the appropriate App Hosting service account. This allows App Hosting to securely inject these secrets as environment variables into both your build environment and your runtime environment.

see: [how-to-keep-your-secrets-from-your-source-code-in-an-angular-project](https://pazel.dev/how-to-keep-your-secrets-from-your-source-code-in-an-angular-project)


### Environment parameters in dev/test environment

In development or test environment, the environment parameters are read from the local environment.
You can find a file bk2/apps/{APPDIR}/.env. Execute this file to write the parameters into your environment:

```sh
source ./apps/{APPDIR}/.env
```

DO NOT COMMIT THE .env FILE INTO YOUR SOURCE CODE MANAGEMENT SYSTEM AS IT CONTAINS SENSITIVE INFORMATION.

## Build process

For a production build (--prod), the build script in package.json will replace the environment.ts with environment.prod.ts.

