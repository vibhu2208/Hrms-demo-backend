require('dotenv').config();
const mongoose = require('mongoose');
const Candidate = require('../models/Candidate');
const JobPosting = require('../models/JobPosting');

// Sample data arrays
const firstNames = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Anjali', 'Rohan', 'Kavya', 'Arjun', 'Meera', 'Karan', 'Pooja', 'Siddharth', 'Neha', 'Aditya', 'Riya', 'Varun', 'Divya', 'Nikhil', 'Shreya'];
const lastNames = ['Sharma', 'Patel', 'Kumar', 'Singh', 'Reddy', 'Gupta', 'Verma', 'Mehta', 'Joshi', 'Nair', 'Rao', 'Desai', 'Iyer', 'Malhotra', 'Chopra', 'Kapoor', 'Agarwal', 'Bose', 'Sinha', 'Pillai'];
const locations = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Noida'];
const companies = ['TCS', 'Infosys', 'Wipro', 'Cognizant', 'Tech Mahindra', 'HCL', 'Accenture', 'Capgemini', 'IBM', 'Oracle'];
const designations = ['Software Engineer', 'Senior Developer', 'Full Stack Developer', 'Backend Developer', 'Frontend Developer', 'DevOps Engineer', 'QA Engineer', 'Data Analyst', 'System Engineer', 'Technical Lead'];
const sources = ['linkedin', 'naukri', 'referral', 'job-portal', 'walk-in', 'other'];
const stages = ['applied', 'screening', 'shortlisted', 'interview-scheduled', 'interview-completed', 'offer-extended'];
const statuses = ['active', 'active', 'active', 'active', 'rejected']; // More active candidates

const skills = [
  ['JavaScript', 'React', 'Node.js', 'MongoDB', 'Express'],
  ['Python', 'Django', 'PostgreSQL', 'REST API', 'Docker'],
  ['Java', 'Spring Boot', 'MySQL', 'Microservices', 'AWS'],
  ['Angular', 'TypeScript', 'RxJS', 'NgRx', 'Material UI'],
  ['Vue.js', 'Nuxt.js', 'Vuex', 'Firebase', 'GraphQL'],
  ['React Native', 'Flutter', 'iOS', 'Android', 'Mobile Development'],
  ['DevOps', 'Jenkins', 'Kubernetes', 'CI/CD', 'Terraform'],
  ['PHP', 'Laravel', 'MySQL', 'Redis', 'jQuery'],
  ['C#', '.NET Core', 'Azure', 'SQL Server', 'Entity Framework'],
  ['Go', 'Rust', 'Microservices', 'gRPC', 'Redis']
];

const degrees = [
  { degree: 'B.Tech', specialization: 'Computer Science', institution: 'IIT Delhi', passingYear: 2020, percentage: 85 },
  { degree: 'B.E', specialization: 'Information Technology', institution: 'BITS Pilani', passingYear: 2019, percentage: 82 },
  { degree: 'MCA', specialization: 'Computer Applications', institution: 'NIT Trichy', passingYear: 2021, percentage: 88 },
  { degree: 'B.Sc', specialization: 'Computer Science', institution: 'Delhi University', passingYear: 2018, percentage: 78 },
  { degree: 'M.Tech', specialization: 'Software Engineering', institution: 'IIT Bombay', passingYear: 2022, percentage: 90 }
];

// Random helper functions
const getRandomElement = (array) => array[Math.floor(Math.random() * array.length)];
const getRandomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getRandomSkills = () => getRandomElement(skills);

// Generate dummy applicants
const generateApplicants = (jobId, count = 20) => {
  const applicants = [];

  for (let i = 0; i < count; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[i % lastNames.length];
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;
    const phone = `+91${getRandomNumber(7000000000, 9999999999)}`;
    const experienceYears = getRandomNumber(0, 8);
    const experienceMonths = getRandomNumber(0, 11);

    const applicant = {
      firstName,
      lastName,
      email,
      phone,
      currentLocation: getRandomElement(locations),
      preferredLocation: [getRandomElement(locations), getRandomElement(locations)],
      source: getRandomElement(sources),
      appliedFor: jobId,
      experience: {
        years: experienceYears,
        months: experienceMonths
      },
      currentCompany: experienceYears > 0 ? getRandomElement(companies) : null,
      currentDesignation: experienceYears > 0 ? getRandomElement(designations) : null,
      currentCTC: experienceYears > 0 ? getRandomNumber(300000, 1500000) : null,
      expectedCTC: getRandomNumber(400000, 2000000),
      noticePeriod: experienceYears > 0 ? getRandomNumber(15, 90) : 0,
      skills: getRandomSkills(),
      education: [getRandomElement(degrees)],
      resume: {
        url: `https://example.com/resumes/${firstName}_${lastName}_resume.pdf`,
        uploadedAt: new Date(Date.now() - getRandomNumber(1, 30) * 24 * 60 * 60 * 1000)
      },
      stage: getRandomElement(stages),
      status: getRandomElement(statuses),
      notes: `Candidate applied for the position. ${experienceYears > 0 ? 'Has relevant experience.' : 'Fresher candidate.'}`,
      isActive: true
    };

    applicants.push(applicant);
  }

  return applicants;
};

// Main seed function
const seedApplicants = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Get the first job posting (or specify a job ID)
    const jobs = await JobPosting.find().limit(1);
    
    if (jobs.length === 0) {
      console.log('❌ No job postings found. Please create a job posting first.');
      process.exit(1);
    }

    const jobId = jobs[0]._id;
    console.log(`📋 Found job: ${jobs[0].title} (ID: ${jobId})`);

    // Check if applicants already exist for this job
    const existingCount = await Candidate.countDocuments({ appliedFor: jobId });
    console.log(`📊 Existing applicants: ${existingCount}`);

    // Generate and insert applicants
    const applicants = generateApplicants(jobId, 20);
    
    // Insert candidates one by one to trigger pre-save hooks
    const result = [];
    for (const applicantData of applicants) {
      const candidate = new Candidate(applicantData);
      await candidate.save();
      result.push(candidate);
    }
    
    console.log(`✅ Successfully added ${result.length} applicants to job: ${jobs[0].title}`);
    
    // Update job posting applications count
    await JobPosting.findByIdAndUpdate(jobId, {
      applications: existingCount + result.length
    });
    console.log(`✅ Updated job applications count to ${existingCount + result.length}`);

    // Display summary
    console.log('\n📈 Summary:');
    console.log(`   Job Title: ${jobs[0].title}`);
    console.log(`   Job ID: ${jobId}`);
    console.log(`   New Applicants: ${result.length}`);
    console.log(`   Total Applicants: ${existingCount + result.length}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding applicants:', error);
    process.exit(1);
  }
};

// Run the seed function
seedApplicants();
