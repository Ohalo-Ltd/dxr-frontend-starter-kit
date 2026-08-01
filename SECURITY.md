# Security

Report a suspected vulnerability privately to the repository owner. Do not open a
public issue, and do not include credentials, customer data, or exploit artifacts
in an ordinary ticket.

> **Set a real contact before sharing this repository.** Replace this paragraph
> with the private reporting address or process for whoever maintains this copy —
> a security policy with no route to a human is not a policy.

Include the affected revision or image digest, the impact, reproduction steps
using synthetic data, and any known containment.

Rotate an exposed credential through its owning system. Deleting it from Git
history is not sufficient — assume anything committed has been read. For a Data
X-Ray API token, revoke and reissue it from the Data X-Ray interface.

Supported versions are the current default branch and any explicitly maintained
release lines. A derived application owns its own support and disclosure policy.
