[33mcommit 25cdcf01c1faedc3008c73dccdc1bad22dfe82ec[m[33m ([m[1;36mHEAD[m[33m -> [m[1;32mmain[m[33m, [m[1;31morigin/main[m[33m)[m
Author: avi682 <avi2468642@gmail.com>
Date:   Fri Mar 13 00:14:19 2026 +0200

    Switch to robust FTP-based ingestion for Osher Ad

 importOfficialPrices.js | 200 [32m++++++++++++++++[m[31m--------------------------------[m
 test_public_access.js   |  25 [32m++++++[m
 2 files changed, 90 insertions(+), 135 deletions(-)

[33mcommit 3ecb5987a07f6c24ba80ccccd6f711b6f758ba78[m
Author: avi682 <avi2468642@gmail.com>
Date:   Thu Mar 12 23:57:04 2026 +0200

    Fix: Full DataTables payload and X-CSRF-Token header for Osher Ad

 importOfficialPrices.js | 12 [32m++++++++++[m[31m--[m
 1 file changed, 10 insertions(+), 2 deletions(-)

[33mcommit 679af2435a1a6b87fc00877c46fa0aa4038abd6d[m
Author: avi682 <avi2468642@gmail.com>
Date:   Thu Mar 12 23:54:46 2026 +0200

    Fix: Cleanup redundant code and syntax errors

 importOfficialPrices.js | 34 [31m----------------------------------[m
 1 file changed, 34 deletions(-)
