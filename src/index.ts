import express from 'express';
const app = express();
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});
if (require.main === module) {
    app.listen(3000, () => console.log('Server running on port 3000'));
}
export default app;