const Department = require('../models/Department');
const { getTenantModel } = require('../middlewares/tenantMiddleware');

exports.getDepartments = async (req, res) => {
  try {
    const DepartmentModel = getTenantModel(req.tenant.connection, 'Department', Department.schema);
    const departments = await DepartmentModel.find({ isActive: true }).populate('head', 'firstName lastName email');
    res.status(200).json({ success: true, data: departments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getDepartment = async (req, res) => {
  try {
    const DepartmentModel = getTenantModel(req.tenant.connection, 'Department', Department.schema);
    const department = await DepartmentModel.findById(req.params.id).populate('head');
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }
    res.status(200).json({ success: true, data: department });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createDepartment = async (req, res) => {
  try {
    const DepartmentModel = getTenantModel(req.tenant.connection, 'Department', Department.schema);
    const department = await DepartmentModel.create(req.body);
    res.status(201).json({ success: true, message: 'Department created successfully', data: department });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateDepartment = async (req, res) => {
  try {
    const DepartmentModel = getTenantModel(req.tenant.connection, 'Department', Department.schema);
    const department = await DepartmentModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }
    res.status(200).json({ success: true, message: 'Department updated successfully', data: department });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const DepartmentModel = getTenantModel(req.tenant.connection, 'Department', Department.schema);
    const department = await DepartmentModel.findByIdAndDelete(req.params.id);
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }
    res.status(200).json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
