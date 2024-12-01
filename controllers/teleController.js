const teleJoiValidation = require("../utils/teleJoiValidation");
const axios = require("axios");
const cheerio = require('cheerio');
const tgGroupModel = require("../models/tgGroups");


async function fetchTgGroupByUrl(url){
    try {
        const response = await axios.get(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            },
        });

        const $ = cheerio.load(response.data);

        // Step 3: Extract group details using Cheerio selectors
        const groupName = $('meta[property="og:title"]').attr("content"); // Group name
        const groupDescription = $('meta[property="og:description"]').attr("content"); // Group description
        const profilePic = $('meta[property="og:image"]').attr("content"); // Profile image URL

        if (groupName.includes('Telegram: Contact')) return false;
        return { status: true, name: groupName, description: groupDescription, image: profilePic };
    } catch (error) {
        return {status:false}
    }
}

const fetchUrl = async(req, res) => {
    try {
        const bodyValidation = teleJoiValidation.submitUrl.validate(req.query);
       if(bodyValidation.error) throw new Error('Invalid Group URL !');

        const getData = await fetchTgGroupByUrl(req.query.url);
        if(!getData.status) throw new Error('something want wrong !');
        delete getData.status;


       return res.status(200).send({
        status:200,
        message:"success",
           data: getData
       })
    } catch (error) {
        return res.send({
            status:400,
            message: error.message
        });
    }
}

const addGorup = async(req, res) => {
    try {
        const { error, value } = teleJoiValidation.addGroup.validate(req.body);
        if (error) throw new Error('Invalid Group Data! Try Again');

        const isGroupExist =await tgGroupModel.findOne({
                url:value.url
        }).select('name');

        if (isGroupExist) throw new Error(`${isGroupExist.name} Group already Exist !`);
        const getData = await fetchTgGroupByUrl(value.url);
        console.log(getData);
        if (!getData.status) throw new Error('something want wrong !');
        delete getData.status;

        const createGroup = new tgGroupModel({
            userKey: value.userKey,
            url:value.url,
            name: getData?.name || value.name,
            image:getData?.image || value.image,
            category: value.category || 'trending',
            description: value.description
        });

      const isRegister =   await createGroup.save()


        return res.status(200).send({
            status:200,
            message: "success",
            data: isRegister
        })
    } catch (error) {
        console.log(error);
        return res.send({
            status: 400,
            message: error.message
        });
    }
}

const myGroups = async(req,res)=>{
    try {
        const {error,value} = teleJoiValidation.myGroups.validate(req.query);
        if (error) throw new Error('Invalid user Key !');

        const myGroups = await tgGroupModel.find({
            userKey: value.userKey,
        }).select('_id name category views status image').sort({ createdAt: -1 });

        return res.status(200).send({
            status: 200,
            message: "success",
            data: myGroups
        })
    } catch (error) {
       console.log(error); 
        return res.send({
            status: 400,
            message: error.message
        });
    }
}

const getGroups = async (req, res) => {
    try {
        const { error, value } = teleJoiValidation.getGroups.validate(req.query);
        if (error) throw new Error('Invalid user Key !');

        const getGroups = await tgGroupModel.find({
            category: value.category,
            status:1
        }).select('_id url name image category views');
        return res.status(200).send({
            status: 200,
            message: "success",
            data: getGroups
        })
    } catch (error) {
        console.log(error);
        return res.send({
            status: 400,
            message: error.message
        });
    }
}

const getGroupsForAdmin = async (req, res) => {
    try {
        const { error, value } = teleJoiValidation.myGroups.validate(req.query);
        if (error) throw new Error('Invalid request status  !');

        const userGroups = await tgGroupModel.find({
            status: value.status
        });
        return res.status(200).send({
            status: 200,
            message: "success",
            data: userGroups
        })
    } catch (error) {
        console.log(error);
        return res.send({
            status: 400,
            message: error.message
        });
    }
}

const approveGroup = async (req,res) =>{
    try {
        const { error, value } = teleJoiValidation.approveGroup.validate(req.body);
        if (error) throw new Error('Invalid requested Group id  !');

        const isStatusChanged = await tgGroupModel.findByIdAndUpdate(value.id,{
            status: 1
        });

        if (!isStatusChanged) throw new Error('While Approving Group! something went Wrong.');

        return res.status(200).send({
            status: 200,
            message: "success",
            data: isStatusChanged
        })
    } catch (error) {
        return res.send({
            status: 400,
            message: error.message
        });
    }
}


module.exports = {
    fetchUrl, addGorup, myGroups, getGroups, getGroupsForAdmin, approveGroup
}