import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router';

import { ImagesScreen } from '../screens/ImagesScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { TasksScreen } from '../screens/TasksScreen';

function Tasks(): React.JSX.Element {
  const navigate = useNavigate();
  return <TasksScreen onOpen={(slug) => { void navigate(`/images/${slug}`); }} />;
}

function Review(): React.JSX.Element {
  const { slug = '' } = useParams();
  return <ReviewScreen slug={slug} />;
}

export function AppRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/taches" replace />} />
      <Route path="/taches" element={<Tasks />} />
      <Route path="/images/:slug" element={<ImagesScreen />} />
      <Route path="/revue/:slug" element={<Review />} />
    </Routes>
  );
}
