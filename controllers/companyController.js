const mongoose = require('mongoose');
const Company = require('../models/company');
const QRCode = require('qrcode');
const { GridFSBucket } = require('mongodb');
const multer = require('multer');
const path = require('path');

// Use environment variable for base URL
const BASE_URL = process.env.BASE_URL || 'http://192.168.0.196:3000';

if (!BASE_URL) {
  throw new Error('BASE_URL environment variable is not set');
}

// Configure GridFS
let gfs;
mongoose.connection.once('open', () => {
  gfs = new GridFSBucket(mongoose.connection.db, {
    bucketName: 'uploads'
  });
});

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Increased to 10MB to accommodate videos
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|mp4/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only JPEG, PNG, and MP4 files are allowed'));
  }
}).fields([
  { name: 'logo', maxCount: 1 },
  { name: 'mainPhotos', maxCount: 5 },
  { name: 'insidePhotos', maxCount: 10 }
]);

exports.getAllCompanies = async (req, res) => {
  try {
    const companies = await Company.find();
    res.render('index', { companies });
  } catch (err) {
    console.error('Error fetching companies:', err.message);
    res.status(500).send('Server Error: Unable to fetch companies');
  }
};

exports.getCreateForm = (req, res) => {
  res.render('create', { error: null });
};

exports.createCompany = (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('File upload error:', err.message);
      return res.render('create', { error: err.message });
    }
    try {
      const { name, address, phone, email, website, mainPhotosCaptions, insidePhotosCaptions, location, developer, agentName, agentPhone, agentEmail, agentRole } = req.body;
      let logoId = null;
      const mainPhotos = [];
      const insidePhotos = [];

      // Handle logo upload
      if (req.files['logo'] && req.files['logo'][0]) {
        const writeStream = gfs.openUploadStream(`${name}_logo`);
        writeStream.write(req.files['logo'][0].buffer);
        writeStream.end();
        logoId = writeStream.id;
      }

      // Handle main photos/videos upload
      if (req.files['mainPhotos']) {
        const captions = Array.isArray(mainPhotosCaptions) ? mainPhotosCaptions : (mainPhotosCaptions ? [mainPhotosCaptions] : []);
        if (captions.length !== req.files['mainPhotos'].length) {
          return res.render('create', { error: 'Please provide a caption for each main photo or video' });
        }
        req.files['mainPhotos'].forEach((file, index) => {
          const isVideo = file.mimetype.includes('video');
          const writeStream = gfs.openUploadStream(`${name}_main_${isVideo ? 'video' : 'photo'}_${Date.now()}`);
          writeStream.write(file.buffer);
          writeStream.end();
          mainPhotos.push({
            fileId: writeStream.id,
            caption: captions[index],
            isVideo
          });
        });
      }

      // Handle inside photos/videos upload
      if (req.files['insidePhotos']) {
        const captions = Array.isArray(insidePhotosCaptions) ? insidePhotosCaptions : (insidePhotosCaptions ? [insidePhotosCaptions] : []);
        if (captions.length !== req.files['insidePhotos'].length) {
          return res.render('create', { error: 'Please provide a caption for each inside photo or video' });
        }
        req.files['insidePhotos'].forEach((file, index) => {
          const isVideo = file.mimetype.includes('video');
          const writeStream = gfs.openUploadStream(`${name}_inside_${isVideo ? 'video' : 'photo'}_${Date.now()}`);
          writeStream.write(file.buffer);
          writeStream.end();
          insidePhotos.push({
            fileId: writeStream.id,
            caption: captions[index],
            isVideo
          });
        });
      }

      const company = new Company({
        name,
        address,
        phone,
        email,
        website,
        logo: logoId,
        mainPhotos,
        insidePhotos,
        location,
        developer,
        agent: {
          name: agentName,
          phone: agentPhone,
          email: agentEmail,
          role: agentRole
        }
      });
      await company.save();
      res.redirect('/');
    } catch (err) {
      console.error('Error creating company:', err.message);
      res.render('create', { error: 'Error creating company: ' + err.message });
    }
  });
};

exports.getCompanyDetails = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).send('Company not found');
    }
    const qrCodeUrl = await QRCode.toDataURL(`${BASE_URL}/website/${company._id}`);
    res.render('details', { company, qrCodeUrl });
  } catch (err) {
    console.error('Error fetching company details:', err.message);
    res.status(500).send('Server Error: Unable to fetch company details');
  }
};

exports.getWebsitePage = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).send('Company not found');
    }
    res.render('website', { company, BASE_URL });
  } catch (err) {
    console.error('Error fetching website page:', err.message);
    res.status(500).send('Server Error: Unable to fetch website page');
  }
};

exports.getLogo = async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);
    const downloadStream = gfs.openDownloadStream(fileId);

    downloadStream.on('error', () => {
      res.status(404).send('Logo not found');
    });

    res.set('Content-Type', 'image/jpeg');
    downloadStream.pipe(res);
  } catch (err) {
    console.error('Error fetching logo:', err.message);
    res.status(500).send('Server Error: Unable to fetch logo');
  }
};

exports.getPhoto = async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);
    const downloadStream = gfs.openDownloadStream(fileId);

    downloadStream.on('error', () => {
      res.status(404).send('File not found');
    });

    // Determine content type based on file metadata or extension
    const file = await mongoose.connection.db.collection('uploads.files').findOne({ _id: fileId });
    const contentType = file && file.contentType ? file.contentType : 'image/jpeg';
    res.set('Content-Type', contentType);
    downloadStream.pipe(res);
  } catch (err) {
    console.error('Error fetching file:', err.message);
    res.status(500).send('Server Error: Unable to fetch file');
  }
};

exports.getUpdateForm = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).send('Company not found');
    }
    res.render('update', { company, error: null });
  } catch (err) {
    console.error('Error fetching company for update:', err.message);
    res.status(500).send('Server Error: Unable to fetch company for update');
  }
};

exports.updateCompany = (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('File upload error:', err.message);
      return res.render('update', { company: req.body, error: err.message });
    }
    try {
      const { name, address, phone, email, website, mainPhotosCaptions, insidePhotosCaptions, existingMainPhotoCaptions, existingInsidePhotoCaptions, location, developer, agentName, agentPhone, agentEmail, agentRole, deleteMainPhotos, deleteInsidePhotos } = req.body;
      const company = await Company.findById(req.params.id);
      if (!company) {
        return res.status(404).send('Company not found');
      }

      let logoId = company.logo;
      if (req.files['logo'] && req.files['logo'][0]) {
        if (logoId) {
          gfs.delete(logoId); // Delete old logo
        }
        const writeStream = gfs.openUploadStream(`${name}_logo`);
        writeStream.write(req.files['logo'][0].buffer);
        writeStream.end();
        logoId = writeStream.id;
      }

      let mainPhotos = company.mainPhotos;
      let insidePhotos = company.insidePhotos;

      // Update captions for existing main photos/videos
      if (existingMainPhotoCaptions) {
        const captions = Array.isArray(existingMainPhotoCaptions) ? existingMainPhotoCaptions : [existingMainPhotoCaptions];
        mainPhotos.forEach((item, index) => {
          if (captions[index]) {
            item.caption = captions[index];
          }
        });
      }

      // Update captions for existing inside photos/videos
      if (existingInsidePhotoCaptions) {
        const captions = Array.isArray(existingInsidePhotoCaptions) ? existingInsidePhotoCaptions : [existingInsidePhotoCaptions];
        insidePhotos.forEach((item, index) => {
          if (captions[index]) {
            item.caption = captions[index];
          }
        });
      }

      // Handle deletion of main photos/videos
      if (deleteMainPhotos) {
        const deleteIds = Array.isArray(deleteMainPhotos) ? deleteMainPhotos : [deleteMainPhotos];
        mainPhotos = mainPhotos.filter(item => !deleteIds.includes(item.fileId.toString()));
        for (const id of deleteIds) {
          await gfs.delete(new mongoose.Types.ObjectId(id));
        }
      }

      // Handle deletion of inside photos/videos
      if (deleteInsidePhotos) {
        const deleteIds = Array.isArray(deleteInsidePhotos) ? deleteInsidePhotos : [deleteInsidePhotos];
        insidePhotos = insidePhotos.filter(item => !deleteIds.includes(item.fileId.toString()));
        for (const id of deleteIds) {
          await gfs.delete(new mongoose.Types.ObjectId(id));
        }
      }

      // Handle new main photos/videos
      if (req.files['mainPhotos']) {
        const captions = Array.isArray(mainPhotosCaptions) ? mainPhotosCaptions : (mainPhotosCaptions ? [mainPhotosCaptions] : []);
        if (captions.length !== req.files['mainPhotos'].length) {
          return res.render('update', { company: req.body, error: 'Please provide a caption for each new main photo or video' });
        }
        req.files['mainPhotos'].forEach((file, index) => {
          const isVideo = file.mimetype.includes('video');
          const writeStream = gfs.openUploadStream(`${name}_main_${isVideo ? 'video' : 'photo'}_${Date.now()}`);
          writeStream.write(file.buffer);
          writeStream.end();
          mainPhotos.push({
            fileId: writeStream.id,
            caption: captions[index],
            isVideo
          });
        });
      }

      // Handle new inside photos/videos
      if (req.files['insidePhotos']) {
        const captions = Array.isArray(insidePhotosCaptions) ? insidePhotosCaptions : (insidePhotosCaptions ? [insidePhotosCaptions] : []);
        if (captions.length !== req.files['insidePhotos'].length) {
          return res.render('update', { company: req.body, error: 'Please provide a caption for each new inside photo or video' });
        }
        req.files['insidePhotos'].forEach((file, index) => {
          const isVideo = file.mimetype.includes('video');
          const writeStream = gfs.openUploadStream(`${name}_inside_${isVideo ? 'video' : 'photo'}_${Date.now()}`);
          writeStream.write(file.buffer);
          writeStream.end();
          insidePhotos.push({
            fileId: writeStream.id,
            caption: captions[index],
            isVideo
          });
        });
      }

      await Company.findByIdAndUpdate(req.params.id, {
        name,
        address,
        phone,
        email,
        website,
        logo: logoId,
        mainPhotos,
        insidePhotos,
        location,
        developer,
        agent: {
          name: agentName,
          phone: agentPhone,
          email: agentEmail,
          role: agentRole
        }
      });
      res.redirect('/');
    } catch (err) {
      console.error('Error updating company:', err.message);
      res.render('update', { company: req.body, error: 'Error updating company: ' + err.message });
    }
  });
};

exports.deleteCompany = async (req, res) => {
  try {
    const company = await Company.findByIdAndDelete(req.params.id);
    if (!company) {
      return res.status(404).send('Company not found');
    }
    // Delete associated files
    if (company.logo) {
      await gfs.delete(company.logo);
    }
    for (const item of company.mainPhotos) {
      await gfs.delete(item.fileId);
    }
    for (const item of company.insidePhotos) {
      await gfs.delete(item.fileId);
    }
    res.redirect('/');
  } catch (err) {
    console.error('Error deleting company:', err.message);
    res.status(500).send('Server Error: Unable to delete company');
  }
};