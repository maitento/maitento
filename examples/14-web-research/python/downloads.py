import sys

from maitento import Maitento

mt = Maitento()
downloads = next((p for p in mt.partitions.list() if p.name == "web-downloads" and p.is_temporary), None)
if downloads is None:
    sys.exit("Run research.py first.")

# The newest files first. Each one is a page an agent read, with the run that read it.
page = mt.partitions.files(downloads.id, limit=5)
for file in page.items:
    source = file.web_source
    expires = file.expires_at.isoformat() if file.expires_at else None
    print(f"{source.url if source else file.name}\n  read by run {source.process_id if source else None}, deleted after {expires}")
