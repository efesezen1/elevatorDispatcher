const express = require('express');
const app = express();

app.use(express.json());

app.use('/api/districts', require('./routes/districts'));
app.use('/api/meters', require('./routes/meters'));
app.use('/api/flow', require('./routes/flowReadings'));
app.use('/api/pressure', require('./routes/pressureReadings'));
app.use('/api/analytics', require('./analytics/analyticsRoutes'));

app.use(require('./middleware/errorHandler'));

module.exports = app;
