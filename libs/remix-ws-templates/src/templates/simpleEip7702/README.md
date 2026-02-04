# EIP 7702

This Workspace Template presents one of the updates shipped with the Pectra upgrade which occurred in May 2025.

### Basics

In the Ethereum blockchain there are two different types of accounts:
- Externally Owned Account (EOA): which requires a private key and can initiate transactions.
- Smart Contract Account: which represents code deployed on the blockchain.

These two concepts are separated: e.g. until now EOAs don't have code associated with them.
But with the Pectra upgrade, EOAs can now host code and can directly run code.

For more information please see [this page](https://eip7702.io)

### How to

This section explains how to run this project. We are going to assign a piece of code to an EOA:

- Open and Compile the file `Example7702.sol`.
- From the `Deploy & Run` module switch to the `Remix VM (pectra)` provider.
- Deploy the contract above (this will be deployed to the in-browser blockchain).
- Copy the address of the contract to the clipboard.
- Click on `Delegation Authorization`.
- In the Modal dialog, paste the contract's address and validate.
- Check in the terminal that the "Delegation" has been "activated".
- Check the list of deployed contracts, you'll see a new instance that calls the current account. This account now also executes code!


## What's next

From the Template explorer, you can create a project using the template `Account Abstraction`:
Open the file `contracts/accounts/Simple7702Account.sol`,
this uses a standard implementation of an 7702 account.
- Compile and deploy this contract (make sure you select the correct contract).
- Check how the functions are being implemented. Specifically the function `execute` and `executeBatch`.


