# Public QR Report Photo Uploads

The public QR safety report form supports optional photo evidence without requiring login.

## Limits

- Maximum photos per report: 5.
- Maximum size per photo: 5 MB.
- Maximum total photo size per submission: 20 MB.
- Accepted formats: JPG, JPEG, PNG and WEBP.
- SVG and other active/document formats are rejected.

The browser validates these limits for UX, and the server enforces them again before upload.

## Storage

Photos are uploaded server-side to the existing S3-compatible storage configured by:

```text
S3_ENDPOINT
S3_REGION
S3_ACCESS_KEY
S3_SECRET_KEY
S3_BUCKET
S3_FORCE_PATH_STYLE
```

Storage keys are generated with UUIDs under `communications/public-reports`; the original filename is never used as the storage path.

## Security Notes

- The QR form remains public, but the QR token and rate limiting are still required.
- Files are validated by magic bytes on the server, not by extension only.
- Public uploads are not exposed by predictable public URLs.
- Backoffice viewing uses an authenticated API route that checks plant permissions and redirects to a short-lived signed download URL.
- The current implementation does not strip EXIF metadata because no image processing library is installed in the project. Add a trusted server-side image processor such as `sharp` if EXIF removal or resizing is required in production.

## Manual Validation

```bash
# Existing JSON submitters should still work.
curl -X POST "https://maxsafety.maportugal.com/r/PLANT/report?t=<token>" \
  -H "content-type: application/json" \
  --data '{"type":"UNSAFE_CONDITION","eventDatetime":"2026-06-03T09:00:00.000Z","reporterName":"Operator Test","reporterEmployeeNo":"001","areaId":"<areaId>","workstationId":"<workstationId>","description":"Unsafe condition with no photo."}'

# Multipart photo upload.
curl -X POST "https://maxsafety.maportugal.com/r/PLANT/report?t=<token>" \
  -F 'payload={"type":"UNSAFE_CONDITION","eventDatetime":"2026-06-03T09:00:00.000Z","reporterName":"Operator Test","reporterEmployeeNo":"001","areaId":"<areaId>","workstationId":"<workstationId>","description":"Unsafe condition with photo."};type=application/json' \
  -F "photos=@photo.jpg;type=image/jpeg"
```

After submission, open the communication detail in the authenticated backoffice and confirm the photo thumbnail is visible.
