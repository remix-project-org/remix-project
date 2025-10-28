
### Circles

This template introduces the usage of the Circles sdk.

## create-group.ts

This script creates a new group on the Circles platform using the Circles SDK. It initializes the SDK with a BrowserProviderContractRunner,
defines the group profile, sets up the base group options, creates the group profile CID, creates the base group,
waits for transaction confirmation, extracts the group address from the transaction receipt, and retrieves the group's avatar.

## group-creation-tx.ts

This script retrieves and logs information about a group created on the Circles platform using the Circles SDK.
It initializes the SDK with a BrowserProviderContractRunner, fetches a transaction receipt,
extracts the group address from the transaction logs, and then retrieves and logs the group's avatar
and its trust relations.

## invite-to-group.ts

This script invites a user to a group on the Circles platform using the Circles SDK. It initializes the SDK with a BrowserProviderContractRunner,
fetches a transaction receipt, extracts the group address from the transaction logs, retrieves the group's avatar,
and then checks if the user is already trusted by the group and trusts the user.

## pathfinder.ts

This script finds a path between two addresses on the Circles platform using the CirclesRpc. It initializes the CirclesRpc with the provided URL,
and then calls the 'circlesV2_findPath' method with the source address, target address, and value.

## set-owner.ts

This script sets the owner of a group on the Circles platform using the Circles SDK. It initializes the SDK with a BrowserProviderContractRunner,
fetches a transaction receipt, extracts the group address from the transaction logs, retrieves the group's avatar,
and then sets the owner of the group.

## user.ts

This script retrieves and logs information about a user's avatar on the Circles platform using the Circles SDK.
It initializes the SDK with a BrowserProviderContractRunner, retrieves the avatar information,
and then logs the mintable amount and the avatar information.
