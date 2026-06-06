import { Router } from 'express';
import { ROLES } from '../config.js';
import { db } from '../store.js';
import { requireAuth, requireRole, audit } from '../middleware.js';
import { buildExcel, buildPdf } from '../services/reports.js';

const router = Router();
router.use(requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.COORDINATOR));

/** Excel export of a drill's records (or all records with ?all=1). */
router.get('/excel/:drillId', async (req, res) => {
  try {
    const buf = await buildExcel(req.params.drillId === 'all' ? null : req.params.drillId);
    audit(req, 'EXPORT_EXCEL', { drillId: req.params.drillId });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="drill-${req.params.drillId}.xlsx"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PDF summary report for a drill. Accepts optional mapSnapshot + comments. */
router.post('/pdf/:drillId', async (req, res) => {
  try {
    const drill = db.findDrill(req.params.drillId);
    if (!drill) return res.status(404).json({ error: 'Drill not found.' });
    const buf = await buildPdf(req.params.drillId, {
      mapSnapshot: req.body.mapSnapshot,
      coordinatorComments: req.body.coordinatorComments,
    });
    audit(req, 'EXPORT_PDF', { drillId: req.params.drillId });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${drill.name.replace(/\W+/g, '_')}.pdf"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
