const FabricCAServices = require('fabric-ca-client')
const {Wallets, Gateway} = require('fabric-network')

const fs = require('fs')
const path = require('path')

async function main(){
    console.log("This is a Fabric test application")


    //Org1 connection profile
    const ccpPath = path.resolve('../organizations/peerOrganizations/org1.example.com/connection-org1.json')
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'))

    //Org1 ca
    const caInfo = ccp.certificateAuthorities['ca.org1.example.com']
    const caTLSCACerts = caInfo.tlsCACerts.pem
    const ca = new FabricCAServices(caInfo.url, {trustedRoots: caTLSCACerts, verify: false }, caInfo.caName)

    // ............

    //Create Wallet 
    const walletPath = path.join(process.cwd(), 'wallet')
    const wallet = await Wallets.newFileSystemWallet(walletPath)
    console.log(`Wallet path: ${walletPath}`)

    //Get Admin Identity 

    var adminIdentity = await wallet.get("admin")

    const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw'});

    const x509Identity = {
        credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes(),
        },
        mspId: 'Org1MSP',
        type: 'X.509',
    };

    await wallet.put("admin", x509Identity)

    console.log("Admin enrolled and saved into wallet successfully")

    adminIdentity = await wallet.get("admin")

    //Register user for this app

    var userIdentity = await wallet.get("appUser")

    if (userIdentity){
        console.log("User Identity exists in waller....")
    } else{

        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type)
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        const secret = await ca.register({
            affiliation: 'org1.department1',
            enrollmentID: 'appUser',
            role: 'client'
        }, adminUser);

        const enrollment = await ca.enroll({
            enrollmentID: 'appUser',
            enrollmentSecret: secret
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };

        await wallet.put('appUser', x509Identity)
        console.log("Enrolled appUser and saved to the wallet")

        userIdentity =  await wallet.get("appUser")

    }

    //Connect to gateway

    const gateway = new Gateway();

    await gateway.connect(ccp, {wallet, identity:'appUser', discovery: {enabled: true, asLocalhost: true}})

    //Connect to channel 

    const network = await gateway.getNetwork('mychannel')

    //select to contract

    const contract = network.getContract("keyvaluechaincode")


    // Query and Invoke

    var result = await contract.evaluateTransaction("QueryKey", "nptel")
    console.log("First query: ", result.toString())

    await contract.submitTransaction("CreateKey", "nptel", "awesome blockchain!")
    
    var result = await contract.evaluateTransaction("QueryKey", "nptel")
    console.log("Second query: ", result.toString())


    //disconnect

    await gateway.disconnect()


}

main()