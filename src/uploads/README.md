Medical files are not stored in this source folder.

Runtime uploads are written to the private directory configured by `UPLOAD_DIR` (default `server/storage`). That keeps documents outside the web root and outside the development file watcher. Production can switch `STORAGE_DRIVER=s3` without changing callers.
