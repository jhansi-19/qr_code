const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const companyController = require('./controllers/companyController');
require('dotenv').config();

const app = express();

// MongoDB Atlas connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Atlas connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Routes
app.get('/', companyController.getAllCompanies);
app.get('/create', companyController.getCreateForm);
app.post('/create', companyController.createCompany);
app.get('/company/:id', companyController.getCompanyDetails);
app.get('/website/:id', companyController.getWebsitePage);
app.get('/logo/:fileId', companyController.getLogo);
app.get('/photo/:fileId', companyController.getPhoto);
app.get('/update/:id', companyController.getUpdateForm);
app.post('/update/:id', companyController.updateCompany);
app.get('/delete/:id', companyController.deleteCompany);

// Start server on 0.0.0.0 to allow external access
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));