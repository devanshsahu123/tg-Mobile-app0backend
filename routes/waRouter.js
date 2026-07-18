const { addGorup, fetchUrl, myGroups, getGroups, approveGroup, getGroupsForAdmin, increaseViews, approveGroupStatus, bulkUpdateStatus, renderAdminPage, cleanupBrokenImageGroups, permanentDeleteGroup } = require('../controllers/waController');
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
router.get('/admin/page', renderAdminPage)
router.get('/admin/cleanupBrokenImages', cleanupBrokenImageGroups)
router.delete('/admin/permanentDelete/:groupId', permanentDeleteGroup)

module.exports = router;