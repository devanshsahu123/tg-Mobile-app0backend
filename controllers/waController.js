const waJoinValidation = require("../utils/waJoinValidation");
const axios = require("axios");
const cheerio = require('cheerio');
const waGroupModel = require("../models/waGroups");
const path = require('path');

/**
 * Checks whether an image URL is reachable by sending a HEAD request.
 * Returns true if the image is accessible (HTTP 2xx), false otherwise.
 */
async function isImageAccessible(imageUrl) {
    try {
        const response = await axios.head(imageUrl, {
            timeout: 8000,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
            },
        });
        return response.status >= 200 && response.status < 300;
    } catch (_err) {
        return false;
    }
}


async function fetchWaGroupByUrl(url) {
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
        const bodyValidation = waJoinValidation.submitUrl.validate(req.query);
        if (bodyValidation.error) throw new Error('Invalid Group URL !');
        const getData = await fetchWaGroupByUrl(req.query.url);
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
        const { error, value } = waJoinValidation.addGroup.validate(req.body);
        if (error) throw new Error('Invalid Group Data! Try Again');

        const isGroupExist = await waGroupModel.findOne({ url: value.url }).select('name');
        if (isGroupExist) throw new Error(`${isGroupExist.name} group already exists!`);

        // Optional: fetch from WhatsApp group page
        // const getData = await fetchWaGroupByUrl(value.url);
        // if (!getData || !getData.status) throw new Error('Failed to fetch group details from WhatsApp');
        // delete getData.status;

        const createGroup = new waGroupModel({
            userKey: value.userKey,
            url: value.url, // no conversion needed
            name: value.name, // or getData.name if fetched dynamically
            image: value.image, // or getData.image
            category: value.category || 'latest',
            description: value.description // or getData.description
        });

        const isRegistered = await createGroup.save();

        return res.status(200).send({
            status: 200,
            message: "Success",
            data: isRegistered
        });
    } catch (error) {
        console.log(error);
        return res.status(400).send({
            status: 400,
            message: error.message
        });
    }
};


const myGroups = async (req, res) => {
    try {
        const { error, value } = waJoinValidation.myGroups.validate(req.query);
        if (error) throw new Error('Invalid user Key !');

        const myGroups = await waGroupModel.find({
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
        const { error, value } = waJoinValidation.getGroups.validate(req.query);
        if (error) throw new Error('Invalid user Key !');

        const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
        const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page if not provided
        const skip = (page - 1) * limit; // Calculate how many items to skip

        let getGroups;
        if (value.category == 'all') {
            getGroups = await waGroupModel.find({
                status: 1
            })
                .select('_id url name image category views')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);
        } else {
            getGroups = await waGroupModel.find({
                category: value.category,
                status: 1
            })
                .select('_id url name image category views')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);
        }

        // Get the total count for pagination metadata
        const totalGroups = await waGroupModel.countDocuments({
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

        await waGroupModel.findByIdAndUpdate(
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
        const { error, value } = waJoinValidation.getGroupsForAdmin.validate(req.query);
        console.log(value);
        if (error) throw new Error( error);

        const userGroups = await waGroupModel.find({
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

const approveGroupStatus = async (req, res) => {
    try {
        const { error, value } = waJoinValidation.approveGroupStatus.validate(req.body);
        if (error) throw new Error('Invalid requested Group id  !');

        const isStatusChanged = await waGroupModel.findByIdAndUpdate(value.groupId, {
            status: value.status
        })

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

        const result = await waGroupModel.updateMany(
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

const renderAdminPage = (req, res) => {
    return res.render(path.join(__dirname, "../pages/wa-admin.ejs"));
}

/**
 * cleanupBrokenImageGroups
 * Scans every pending-approval group (status = 0), checks if its image URL
 * is reachable, and auto-deletes groups whose image is broken / missing.
 *
 * GET /admin/cleanupBrokenImages
 */
const cleanupBrokenImageGroups = async (req, res) => {
    try {
        // Fetch all groups that are still pending approval
        const pendingGroups = await waGroupModel
            .find({ status: 0 })
            .select('_id name image');

        if (pendingGroups.length === 0) {
            return res.status(200).send({
                status: 200,
                message: 'No pending groups to check.',
                data: { checked: 0, deleted: 0, deletedGroups: [] }
            });
        }

        const deletedGroups = [];

        // Check each group's image URL in parallel
        await Promise.all(
            pendingGroups.map(async (group) => {
                const imageOk = group.image && await isImageAccessible(group.image);
                if (!imageOk) {
                    await waGroupModel.findByIdAndDelete(group._id);
                    deletedGroups.push({ _id: group._id, name: group.name, image: group.image });
                    console.log(`[WA Cleanup] Deleted group "${group.name}" — image not accessible: ${group.image}`);
                }
            })
        );

        return res.status(200).send({
            status: 200,
            message: `Cleanup complete. ${deletedGroups.length} group(s) deleted out of ${pendingGroups.length} checked.`,
            data: {
                checked: pendingGroups.length,
                deleted: deletedGroups.length,
                deletedGroups
            }
        });
    } catch (error) {
        console.log('[WA Cleanup] Error:', error);
        return res.status(500).send({
            status: 500,
            message: error.message
        });
    }
}


/**
 * permanentDeleteGroup
 * Permanently removes a single group document from the DB.
 * Intended for admin use on rejected groups.
 *
 * DELETE /admin/permanentDelete/:groupId
 */
const permanentDeleteGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        if (!groupId) throw new Error('groupId is required');

        const deleted = await waGroupModel.findByIdAndDelete(groupId);
        if (!deleted) throw new Error('Group not found or already deleted');

        return res.status(200).send({
            status: 200,
            message: `Group "${deleted.name}" permanently deleted`,
            data: { _id: deleted._id, name: deleted.name }
        });
    } catch (error) {
        console.log('[WA PermanentDelete] Error:', error);
        return res.status(400).send({
            status: 400,
            message: error.message
        });
    }
};

module.exports = {
    fetchUrl, addGorup, myGroups, getGroups, increaseViews, getGroupsForAdmin,
    approveGroupStatus, bulkUpdateStatus, renderAdminPage, cleanupBrokenImageGroups,
    permanentDeleteGroup
}