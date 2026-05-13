require('dotenv').config();
const mongoose = require('mongoose');
const Candidate = require('../models/Candidate');
const JobPosting = require('../models/JobPosting');

// Get job ID from command line argument
const jobId = process.argv[2];

if (!jobId) {
  console.log('❌ Please provide a job ID as argument');
  console.log('Usage: node seedApplicantsToJob.js <JOB_ID>');
  process.exit(1);
}

// Sample data
const applicantsData = [
  { firstName: 'Rahul', lastName: 'Sharma', location: 'Mumbai', company: 'TCS', designation: 'Software Engineer', exp: { years: 3, months: 6 }, skills: ['JavaScript', 'React', 'Node.js', 'MongoDB'] },
  { firstName: 'Priya', lastName: 'Patel', location: 'Delhi', company: 'Infosys', designation: 'Senior Developer', exp: { years: 5, months: 2 }, skills: ['Python', 'Django', 'PostgreSQL', 'REST API'] },
  { firstName: 'Amit', lastName: 'Kumar', location: 'Bangalore', company: 'Wipro', designation: 'Full Stack Developer', exp: { years: 4, months: 8 }, skills: ['Java', 'Spring Boot', 'MySQL', 'AWS'] },
  { firstName: 'Sneha', lastName: 'Singh', location: 'Hyderabad', company: 'Cognizant', designation: 'Backend Developer', exp: { years: 2, months: 10 }, skills: ['Node.js', 'Express', 'MongoDB', 'Docker'] },
  { firstName: 'Vikram', lastName: 'Reddy', location: 'Chennai', company: 'Tech Mahindra', designation: 'Frontend Developer', exp: { years: 3, months: 4 }, skills: ['Angular', 'TypeScript', 'RxJS', 'Material UI'] },
  { firstName: 'Anjali', lastName: 'Gupta', location: 'Pune', company: 'HCL', designation: 'DevOps Engineer', exp: { years: 4, months: 0 }, skills: ['Jenkins', 'Kubernetes', 'Docker', 'AWS'] },
  { firstName: 'Rohan', lastName: 'Verma', location: 'Kolkata', company: 'Accenture', designation: 'QA Engineer', exp: { years: 2, months: 6 }, skills: ['Selenium', 'Java', 'TestNG', 'Automation'] },
  { firstName: 'Kavya', lastName: 'Mehta', location: 'Ahmedabad', company: 'Capgemini', designation: 'Data Analyst', exp: { years: 1, months: 8 }, skills: ['Python', 'SQL', 'Tableau', 'Excel'] },
  { firstName: 'Arjun', lastName: 'Joshi', location: 'Jaipur', company: 'IBM', designation: 'System Engineer', exp: { years: 2, months: 3 }, skills: ['Linux', 'Networking', 'Cloud', 'Security'] },
  { firstName: 'Meera', lastName: 'Nair', location: 'Noida', company: 'Oracle', designation: 'Technical Lead', exp: { years: 6, months: 5 }, skills: ['Java', 'Microservices', 'Spring', 'Kafka'] },
  { firstName: 'Karan', lastName: 'Rao', location: 'Mumbai', company: null, designation: null, exp: { years: 0, months: 0 }, skills: ['JavaScript', 'HTML', 'CSS', 'React'] },
  { firstName: 'Pooja', lastName: 'Desai', location: 'Bangalore', company: 'Flipkart', designation: 'Software Developer', exp: { years: 3, months: 0 }, skills: ['React', 'Redux', 'Node.js', 'GraphQL'] },
  { firstName: 'Siddharth', lastName: 'Iyer', location: 'Delhi', company: 'Amazon', designation: 'SDE-2', exp: { years: 4, months: 6 }, skills: ['Java', 'AWS', 'DynamoDB', 'Lambda'] },
  { firstName: 'Neha', lastName: 'Malhotra', location: 'Hyderabad', company: 'Microsoft', designation: 'Software Engineer', exp: { years: 3, months: 9 }, skills: ['C#', '.NET', 'Azure', 'SQL Server'] },
  { firstName: 'Aditya', lastName: 'Chopra', location: 'Chennai', company: 'Google', designation: 'Frontend Engineer', exp: { years: 5, months: 1 }, skills: ['React', 'TypeScript', 'Next.js', 'TailwindCSS'] },
  { firstName: 'Riya', lastName: 'Kapoor', location: 'Pune', company: null, designation: null, exp: { years: 0, months: 6 }, skills: ['Python', 'Flask', 'SQL', 'Git'] },
  { firstName: 'Varun', lastName: 'Agarwal', location: 'Kolkata', company: 'Paytm', designation: 'Backend Developer', exp: { years: 2, months: 8 }, skills: ['Node.js', 'MongoDB', 'Redis', 'Microservices'] },
  { firstName: 'Divya', lastName: 'Bose', location: 'Bangalore', company: 'Swiggy', designation: 'Full Stack Developer', exp: { years: 3, months: 3 }, skills: ['React', 'Node.js', 'PostgreSQL', 'Docker'] },
  { firstName: 'Nikhil', lastName: 'Sinha', location: 'Mumbai', company: 'Zomato', designation: 'Mobile Developer', exp: { years: 4, months: 2 }, skills: ['React Native', 'JavaScript', 'Redux', 'Firebase'] },
  { firstName: 'Shreya', lastName: 'Pillai', location: 'Delhi', company: 'Ola', designation: 'Data Engineer', exp: { years: 3, months: 7 }, skills: ['Python', 'Spark', 'Hadoop', 'Airflow'] }
];

const stages = ['applied', 'screening', 'shortlisted', 'interview-scheduled', 'interview-completed', 'offer-extended'];
const sources = ['linkedin', 'naukri', 'referral', 'job-portal', 'walk-in'];
const statuses = ['active', 'active', 'active', 'rejected'];

const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const getRandomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const seedApplicants = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Verify job exists
    const job = await JobPosting.findById(jobId);
    if (!job) {
      console.log(`❌ Job with ID ${jobId} not found`);
      process.exit(1);
    }

    console.log(`📋 Job Found: ${job.title}`);
    console.log(`📍 Department: ${job.department}`);

    // Create applicants
    const candidates = applicantsData.map((data, index) => ({
      firstName: data.firstName,
      lastName: data.lastName,
      email: `${data.firstName.toLowerCase()}.${data.lastName.toLowerCase()}@example.com`,
      phone: `+91${9000000000 + index}`,
      currentLocation: data.location,
      preferredLocation: [data.location],
      source: getRandomElement(sources),
      appliedFor: jobId,
      experience: data.exp,
      currentCompany: data.company,
      currentDesignation: data.designation,
      currentCTC: data.exp.years > 0 ? getRandomNumber(300000, 1500000) : null,
      expectedCTC: getRandomNumber(400000, 2000000),
      noticePeriod: data.exp.years > 0 ? getRandomNumber(15, 90) : 0,
      skills: data.skills,
      education: [{
        degree: 'B.Tech',
        specialization: 'Computer Science',
        institution: 'University',
        passingYear: 2020 - data.exp.years,
        percentage: getRandomNumber(70, 95)
      }],
      resume: {
        url: `https://example.com/resumes/${data.firstName}_${data.lastName}.pdf`,
        uploadedAt: new Date(Date.now() - getRandomNumber(1, 30) * 24 * 60 * 60 * 1000)
      },
      stage: getRandomElement(stages),
      status: getRandomElement(statuses),
      notes: `Applied for ${job.title}`,
      isActive: true
    }));

    // Insert candidates one by one to trigger pre-save hooks
    const result = [];
    for (const candidateData of candidates) {
      const candidate = new Candidate(candidateData);
      await candidate.save();
      result.push(candidate);
    }
    console.log(`✅ Added ${result.length} applicants`);

    // Update job applications count
    const totalApplicants = await Candidate.countDocuments({ appliedFor: jobId });
    await JobPosting.findByIdAndUpdate(jobId, { applications: totalApplicants });
    console.log(`✅ Updated job applications count to ${totalApplicants}`);

    console.log('\n📊 Summary:');
    console.log(`   Job: ${job.title}`);
    console.log(`   Total Applicants: ${totalApplicants}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

seedApplicants();
