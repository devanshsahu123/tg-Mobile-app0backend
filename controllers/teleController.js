const teleJoiValidation = require("../utils/teleJoiValidation");
const axios = require("axios");
const cheerio = require('cheerio');
const tgGroupModel = require("../models/tgGroups");
const path = require('path');

async function fetchTgGroupByUrl(url) {
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
        return { status: false }
    }
}

const fetchUrl = async (req, res) => {
    try {
        const bodyValidation = teleJoiValidation.submitUrl.validate(req.query);
        if (bodyValidation.error) throw new Error('Invalid Group URL !');


        req.query.url = `https://telegram.me/${req.query.url.split('t.me/')[1]}`
        const getData = await fetchTgGroupByUrl(req.query.url);
        if (!getData.status) throw new Error('No Group Exist!');
        delete getData.status;
        return res.status(200).send({
            status: 200,
            message: "success",
            data: getData
        })
    } catch (error) {
        return res.send({
            status: 400,
            message: error.message
        });
    }
}

const addGorup = async (req, res) => {
    try {
        const { error, value } = teleJoiValidation.addGroup.validate(req.body);

        if (error) throw new Error('Invalid Group URL! Please Try Again');
        const normalizeURL = `https://telegram.me/${value.url.split('t.me/')[1]}`

        const existingGroups = await tgGroupModel.find({
            url: normalizeURL
        }).select('name userKey');

        const sameUserGroup = existingGroups.find(g => g.userKey == value.userKey);
        if (sameUserGroup) {
            throw new Error(`${sameUserGroup.name} Group already Exist !`);
        }

        if (existingGroups.length > 0) {
            await tgGroupModel.deleteMany({ url: normalizeURL });
        }

        const createGroup = new tgGroupModel({
            userKey: value.userKey,
            url: normalizeURL,
            name: value.name,
            image: value.image,
            category: value.category || 'latest',
            description: value.description
        });

        const isRegister = await createGroup.save()


        return res.status(200).send({
            status: 200,
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

const myGroups = async (req, res) => {
    try {
        const { error, value } = teleJoiValidation.myGroups.validate(req.query);
        if (error) throw new Error('Invalid user Key !');

        const myGroups = await tgGroupModel.find({
            userKey: value.userKey,
        }).select('_id name category views status image url').sort({ createdAt: -1 });

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

        if (error) throw new Error('Invalid user Key !' + error.message);

        const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
        const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page if not provided
        const skip = (page - 1) * limit; // Calculate how many items to skip

        let getGroups;
        if (value.category == 'all') {
            getGroups = await tgGroupModel.find({
                status: 1
            })
                .select('_id url name image category views')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);
        } else {
            getGroups = await tgGroupModel.find({
                category: value.category,
                status: 1
            })
                .select('_id url name image category views')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);
        }

        // Get the total count for pagination metadata
        const totalGroups = await tgGroupModel.countDocuments({
            status: 1,
            ...(value.category !== 'all' && { category: value.category })
        });

        const totalPages = Math.ceil(totalGroups / limit); // Calculate the total number of pages

        return res.status(200).send({
            status: 200,
            message: "success",
            data: getGroups,
            pagination: {
                totalItems: totalGroups,
                totalPages: totalPages
            },
        });
    } catch (error) {
        console.log(error);
        return res.send({
            status: 400,
            message: error.message,
        });
    }
};


const increaseViews = async (req, res) => {
    try {
        const { groupId } = req.body;

        await tgGroupModel.findByIdAndUpdate(
            groupId,
            { $inc: { views: 1 } }
        );

        return res.status(200).send({
            status: 200,
            message: 'View count increased successfully',
        });

    } catch (error) {
        console.log('Error in increaseViews:', error);
        return res.status(500).send({
            status: 500,
            message: 'Something went wrong',
        });
    }
};

const getGroupsForAdmin = async (req, res) => {
    try {
        const { error, value } = teleJoiValidation.getGroupsForAdmin.validate(req.query);
        if (error) throw new Error(error);
        const userGroups = await tgGroupModel.find({
            status: value.status,
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

const approveGroupStatus = async (req, res) => {
    try {
        const { error, value } = teleJoiValidation.approveGroupStatus.validate(req.body);
        if (error) throw new Error('Invalid requested Group id  !');

        const isStatusChanged = await tgGroupModel.findByIdAndUpdate(value.groupId, {
            status: value.status
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

const bulkUpdateStatus = async (req, res) => {
    try {
        const { groupIds, status } = req.body;
        if (!Array.isArray(groupIds) || groupIds.length === 0) {
            throw new Error('groupIds must be a non-empty array');
        }
        if (![0, 1, 2].includes(Number(status))) {
            throw new Error('Invalid status value. Must be 0, 1, or 2');
        }

        const result = await tgGroupModel.updateMany(
            { _id: { $in: groupIds } },
            { $set: { status: Number(status) } }
        );

        return res.status(200).send({
            status: 200,
            message: `Successfully updated ${result.modifiedCount} group(s)`,
            data: { modifiedCount: result.modifiedCount }
        });
    } catch (error) {
        console.log(error);
        return res.status(400).send({
            status: 400,
            message: error.message
        });
    }
}

const renderAdminPage = async (req, res) => {
    try {
        res.render(path.join(__dirname, "../pages/tg-admin.ejs"));
    } catch (error) {
        console.log(error);
        return res.send({
            status: 400,
            message: error.message
        });
    }
}


/**
 * permanentDeleteGroup
 * Permanently removes a single TG group document from the DB.
 * Intended for admin use on rejected groups.
 *
 * DELETE /admin/permanentDelete/:groupId
 */
const permanentDeleteGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        if (!groupId) throw new Error('groupId is required');

        const deleted = await tgGroupModel.findByIdAndDelete(groupId);
        if (!deleted) throw new Error('Group not found or already deleted');

        return res.status(200).send({
            status: 200,
            message: `Group "${deleted.name}" permanently deleted`,
            data: { _id: deleted._id, name: deleted.name }
        });
    } catch (error) {
        console.log('[TG PermanentDelete] Error:', error);
        return res.status(400).send({
            status: 400,
            message: error.message
        });
    }
};

/**
 * bulkPermanentDelete
 * Permanently removes multiple rejected TG group documents from the DB.
 *
 * POST /admin/bulkPermanentDelete
 * Body: { groupIds: ["id1", "id2", ...] }
 */
const bulkPermanentDelete = async (req, res) => {
    try {
        const { groupIds } = req.body;
        if (!Array.isArray(groupIds) || groupIds.length === 0) {
            throw new Error('groupIds must be a non-empty array');
        }

        const result = await tgGroupModel.deleteMany({ _id: { $in: groupIds } });

        return res.status(200).send({
            status: 200,
            message: `${result.deletedCount} group(s) permanently deleted`,
            data: { deletedCount: result.deletedCount }
        });
    } catch (error) {
        console.log('[TG BulkPermanentDelete] Error:', error);
        return res.status(400).send({
            status: 400,
            message: error.message
        });
    }
};

module.exports = {
    fetchUrl, addGorup, myGroups, getGroups, increaseViews, getGroupsForAdmin,
    approveGroupStatus, bulkUpdateStatus, renderAdminPage, permanentDeleteGroup,
    bulkPermanentDelete
}