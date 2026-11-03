# Worker settings

Open `cc-bro ui`, then **Settings** in the header. Choose **Global defaults** or a registered project. The page shows detection results and the settings cc-bro applies; it does not edit another CLI’s configuration.

## Detection and login

**Refresh detection** checks installed executables and versions. Codex uses app-server’s `model/list`, `config/read` and `account/read`; pi uses non-generating RPC state/model queries and `auth check --no-refresh`; agy uses `models` and its read-only `/model` and `/effort`; Cursor uses `models` and `status`, plus the public model setting. Only supported non-secret fields are retained. Credential files are checked for existence where useful, never opened for values. No session history is inspected.

An unknown login status is not a failed login. Use **Log in with CLI** to open its own command in Terminal. pi uses its interactive `/login` command; choose the intended provider there. Authentication, refresh and storage remain the CLI’s responsibility. Refresh the page’s detection after login finishes.

**Install in Terminal** and **Upgrade in Terminal** open the documented installer or updater. These are explicit user actions and may change the selected CLI installation. Detection itself never installs, upgrades or writes CLI settings.

## Global and project settings

- Global notes, model and effort defaults, and rules are inherited unless overridden for a project.
- Existing project allowlists remain independent. Select **Inherit global allowlist and default bro** to opt in; otherwise select allowed IDs and a default for this project.
- Project rules add to global rules by default. **Replace global rules** replaces the global set.
- A project’s bro fields override corresponding global fields. **Remove this project override** restores inheritance for that bro.
- The **Save settings** action persists everything in cc-bro’s registry. It applies on the next dispatch. Another open tab changing settings causes a reload warning instead of silent overwriting.

To add a pi provider, enter `pi:provider` in the worker list and allow it explicitly. To add another CLI, use `custom:name` and follow [the custom CLI guide](custom-cli.md). No wildcard pi permission is implied.

Proposed notes remain pending until a user accepts them. The page shows the current note before replacement. Dismissal preserves the user’s note.


**Model visibility** lists detected models with capabilities and descriptions. Search and select **Hide** to hide a family. A project can inherit or replace the global hidden list. Model and effort overrides are per bro, globally or per project; the roster reports the effective defaults.
