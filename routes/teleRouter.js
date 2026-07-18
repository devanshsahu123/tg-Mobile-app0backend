const { addGorup, fetchUrl, myGroups, getGroups, approveGroupStatus, getGroupsForAdmin, increaseViews, bulkUpdateStatus, renderAdminPage, permanentDeleteGroup } = require('../controllers/teleController');
const router = require('express').Router()

router.get('/fetchUrl', fetchUrl);

router.post('/addGroup', addGorup);

router.get('/myGroups', myGroups);

router.get('/getGroups', getGroups);

router.post('/increaseViews', increaseViews);

//admin Routes
router.get('/admin/getGroups', getGroupsForAdmin);
router.post('/admin/updateStatus', approveGroupStatus);
router.post('/admin/bulkUpdateStatus', bulkUpdateStatus);
router.get('/admin/page',renderAdminPage)
router.delete('/admin/permanentDelete/:groupId', permanentDeleteGroup)



module.exports = router;